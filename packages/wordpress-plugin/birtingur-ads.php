<?php
/**
 * Plugin Name: Birtingur — Vefauglýsingar & Umferðarmæling
 * Plugin URI: https://birtingur.app/midlar
 * Description: Sjálfvirk innleiðing á vefborðum og mælikóða frá Birtingi. Engar vafrakökur, léttur kóði og sjálfvirk staðsetning í efni.
 * Version: 1.0.0
 * Author: Birtingur
 * Author URI: https://birtingur.app
 * License: GPLv2 or later
 * Text Domain: birtingur-ads
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

define('BIRTINGUR_ADS_VERSION', '1.0.0');
define('BIRTINGUR_ADS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('BIRTINGUR_ADS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('BIRTINGUR_ADS_DEFAULT_SERVING_BASE', 'https://serving.birtingur.app');
define('BIRTINGUR_ADS_DEFAULT_API_BASE', 'https://api.birtingur.app');

// Include required classes
require_once BIRTINGUR_ADS_PLUGIN_DIR . 'includes/class-birtingur-ads-api.php';
require_once BIRTINGUR_ADS_PLUGIN_DIR . 'includes/class-birtingur-ads-admin.php';
require_once BIRTINGUR_ADS_PLUGIN_DIR . 'includes/class-birtingur-ads-frontend.php';
require_once BIRTINGUR_ADS_PLUGIN_DIR . 'includes/class-birtingur-ads-shortcodes.php';

/**
 * Main plugin orchestration class.
 */
class BirtingurAdsPlugin {
    private static $instance = null;

    public $api;
    public $admin;
    public $frontend;
    public $shortcodes;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->api        = new BirtingurAdsApi();
        $this->admin      = new BirtingurAdsAdmin($this->api);
        $this->frontend   = new BirtingurAdsFrontend();
        $this->shortcodes = new BirtingurAdsShortcodes();

        add_action('init', array($this, 'init'));
    }

    public function init() {
        load_plugin_textdomain('birtingur-ads', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
}

// Initialize the plugin
add_action('plugins_loaded', function() {
    BirtingurAdsPlugin::get_instance();
});
