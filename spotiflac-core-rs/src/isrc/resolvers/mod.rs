pub mod songstats;
pub mod soundplate;
pub mod songlink;

#[derive(Default, Debug, Clone)]
pub struct ResolvedPlatformLinks {
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
    pub deezer_url: Option<String>,
}
