const AdmZip = require('adm-zip');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { zipUrl } = req.body;

  if (!zipUrl) {
    return res.status(400).json({ error: 'zipUrl required' });
  }

  const buildId = Date.now();
  const tmpDir = `/tmp/build_${buildId}`;

  try {
    fs.ensureDirSync(tmpDir);

    // Download ZIP
    const response = await axios.get(zipUrl, { responseType: 'arraybuffer' });
    const zipPath = `/tmp/${buildId}.zip`;
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    // Ekstrak ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);

    // Cari folder project
    const files = fs.readdirSync(tmpDir);
    let projectDir = tmpDir;

    if (!fs.existsSync(path.join(tmpDir, 'pubspec.yaml'))) {
      for (const file of files) {
        const subPath = path.join(tmpDir, file);
        if (fs.statSync(subPath).isDirectory() && fs.existsSync(path.join(subPath, 'pubspec.yaml'))) {
          projectDir = subPath;
          break;
        }
      }
    }

    // Build APK
    execSync('flutter pub get', { cwd: projectDir, timeout: 120000 });
    execSync('flutter build apk --release', { cwd: projectDir, timeout: 600000 });

    // Cari APK
    const apkPath = path.join(projectDir, 'build/app/outputs/flutter-apk/app-release.apk');

    if (!fs.existsSync(apkPath)) {
      return res.json({ success: false, error: 'APK tidak ditemukan' });
    }

    const apkBuffer = fs.readFileSync(apkPath);
    const apkBase64 = apkBuffer.toString('base64');

    // Bersihkan
    fs.removeSync(tmpDir);
    fs.removeSync(zipPath);

    return res.json({
      success: true,
      apk: apkBase64,
      size: apkBuffer.length,
      message: 'Build sukses'
    });

  } catch (error) {
    try { fs.removeSync(tmpDir); } catch (e) {}
    try { fs.removeSync(`/tmp/${buildId}.zip`); } catch (e) {}

    return res.json({
      success: false,
      error: error.message || 'Build failed'
    });
  }
};
