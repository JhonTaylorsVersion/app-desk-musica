use std::env;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub host: IpAddr,
    pub port: u16,
    pub library_root: Option<PathBuf>,
    pub auth_token: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let host = env::var("MUSIC_SERVER_HOST")
            .ok()
            .and_then(|raw| raw.parse::<IpAddr>().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));

        let port = env::var("MUSIC_SERVER_PORT")
            .ok()
            .and_then(|raw| raw.parse::<u16>().ok())
            .unwrap_or(4850);

        let library_root = env::var("MUSIC_LIBRARY_ROOT")
            .ok()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
            .map(PathBuf::from);

        let auth_token = env::var("MUSIC_SERVER_AUTH_TOKEN")
            .ok()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty());

        Self {
            host,
            port,
            library_root,
            auth_token,
        }
    }

    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}
