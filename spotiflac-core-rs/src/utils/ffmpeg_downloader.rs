use anyhow::{Result, anyhow};
use std::path::Path;
use std::env;
use std::fs;
use std::io;
use reqwest::Client;
use zip::ZipArchive;
use tempfile::NamedTempFile;

const FFMPEG_RELEASE_BASE_URL: &str = "https://github.com/afkarxyz/ffmpeg-binaries/releases/download/v8.1";

pub struct FFmpegDownloader;

impl FFmpegDownloader {
    pub async fn ensure_binaries() -> Result<()> {
        let ffmpeg_exists = crate::utils::ffmpeg::FFmpeg::get_path().is_ok();
        let ffprobe_exists = crate::utils::ffmpeg::FFprobe::get_path().is_ok();

        if !ffmpeg_exists || !ffprobe_exists {
            println!("- [AVISO] FFmpeg o FFprobe no encontrados. Iniciando descarga automática...");
            Self::download_binaries(None::<fn(f64, &str)>).await?;
        } else {
            println!("  ✓ FFmpeg y FFprobe encontrados.");
        }

        Ok(())
    }

    pub async fn download_binaries<F>(progress_callback: Option<F>) -> Result<()> 
    where F: Fn(f64, &str) + Send + Sync + 'static
    {
        let client = Client::new();
        let (ffmpeg_url, ffprobe_url) = Self::get_download_urls()?;
        
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
        let dest_dir = home.join(".spotiflac");
        if !dest_dir.exists() {
            fs::create_dir_all(&dest_dir)?;
        }
        
        // Download and extract FFmpeg
        if let Some(ref cb) = progress_callback { cb(10.0, "Downloading FFmpeg..."); }
        Self::download_and_extract(&client, &ffmpeg_url, &dest_dir, "ffmpeg").await?;
        
        // Download and extract FFprobe
        if let Some(ref cb) = progress_callback { cb(50.0, "Downloading FFprobe..."); }
        Self::download_and_extract(&client, &ffprobe_url, &dest_dir, "ffprobe").await?;

        if let Some(ref cb) = progress_callback { cb(100.0, "FFmpeg binaries installed successfully."); }
        Ok(())
    }

    fn get_download_urls() -> Result<(String, String)> {
        let os = env::consts::OS;
        let arch = env::consts::ARCH;

        let (ffmpeg_asset, ffprobe_asset) = match (os, arch) {
            ("windows", _) => ("ffmpeg-windows.zip", "ffprobe-windows.zip"),
            ("linux", "x86_64") => ("ffmpeg-linux-amd64.zip", "ffprobe-linux-amd64.zip"),
            ("linux", "aarch64") => ("ffmpeg-linux-arm64v8.zip", "ffprobe-linux-arm64v8.zip"),
            ("macos", "x86_64") => ("ffmpeg-macos-amd64.zip", "ffprobe-macos-amd64.zip"),
            ("macos", "aarch64") => ("ffmpeg-macos-arm64.zip", "ffprobe-macos-arm64.zip"),
            _ => return Err(anyhow!("Unsupported platform: {} {}", os, arch)),
        };

        Ok((
            format!("{}/{}", FFMPEG_RELEASE_BASE_URL, ffmpeg_asset),
            format!("{}/{}", FFMPEG_RELEASE_BASE_URL, ffprobe_asset)
        ))
    }

    async fn download_and_extract(client: &Client, url: &str, dest_dir: &Path, binary_name: &str) -> Result<()> {
        println!("  📥 Descargando {}...", binary_name);
        let response = client.get(url)
            .header("User-Agent", crate::models::APP_USER_AGENT)
            .send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to download {}: HTTP {}", url, response.status()));
        }

        let mut tmp_file = NamedTempFile::new()?;
        let bytes = response.bytes().await?;
        io::copy(&mut &bytes[..], &mut tmp_file)?;

        let is_zip = url.ends_with(".zip");
        let is_tar_xz = url.ends_with(".tar.xz");

        let expected_name = if cfg!(windows) {
            format!("{}.exe", binary_name)
        } else {
            binary_name.to_string()
        };

        if is_zip {
            Self::extract_zip(tmp_file.path(), dest_dir, &expected_name)?;
        } else if is_tar_xz {
            Self::extract_tar_xz(tmp_file.path(), dest_dir, &expected_name)?;
        } else {
            return Err(anyhow!("Unsupported archive format for {}", url));
        }

        Ok(())
    }

    fn extract_zip(zip_path: &Path, dest_dir: &Path, expected_name: &str) -> Result<()> {
        let file = fs::File::open(zip_path)?;
        let mut archive = ZipArchive::new(file)?;

        let mut found = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let file_name = file.name();
            
            if file_name.ends_with(expected_name) {
                let out_path = dest_dir.join(expected_name);
                let mut out_file = fs::File::create(&out_path)?;
                io::copy(&mut file, &mut out_file)?;
                
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = fs::metadata(&out_path)?.permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&out_path, perms)?;
                }
                
                found = true;
                break;
            }
        }

        if !found {
            return Err(anyhow!("{} not found in ZIP archive", expected_name));
        }
        Ok(())
    }

    fn extract_tar_xz(xz_path: &Path, dest_dir: &Path, expected_name: &str) -> Result<()> {
        use xz2::read::XzDecoder;
        use tar::Archive;

        let file = fs::File::open(xz_path)?;
        let decompressor = XzDecoder::new(file);
        let mut archive = Archive::new(decompressor);

        let mut found = false;
        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.to_path_buf();
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

            if file_name == expected_name {
                let out_path = dest_dir.join(expected_name);
                entry.unpack(&out_path)?;
                
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = fs::metadata(&out_path)?.permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&out_path, perms)?;
                }
                
                found = true;
                break;
            }
        }

        if !found {
            return Err(anyhow!("{} not found in TAR.XZ archive", expected_name));
        }
        Ok(())
    }
}
