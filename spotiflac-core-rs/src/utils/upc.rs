pub const PREFERRED_UPC_TAG_KEY: &str = "UPC";

pub const FFPROBE_UPC_TAG_KEYS: &[&str] = &[
    "upc",
    "barcode",
    "wm/upc",
    "txxx:upc",
    "txxx:barcode",
    "txxx/upc",
    "txxx/barcode",
    "----:com.apple.itunes:upc",
    "----:com.apple.itunes:barcode",
];

pub fn classify_upc_description(description: &str) -> (bool, bool) {
    match description.to_uppercase().trim() {
        "UPC" => (true, true),
        "BARCODE" => (true, false),
        _ => (false, false),
    }
}

pub fn first_preferred_ffprobe_upc_value(tags: &std::collections::HashMap<String, String>) -> Option<String> {
    for &key in FFPROBE_UPC_TAG_KEYS {
        if let Some(value) = tags.get(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}
