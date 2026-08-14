<?php
/**
 * Test bootstrap: a controllable fake of the small slice of WordPress this
 * plugin touches, so the plugin's OWN PHP can be executed and asserted on.
 *
 * The suite this replaced was written in TypeScript and never executed a single
 * line of PHP. Its one behavioural test reimplemented the paragraph-injection
 * algorithm inside the test body and asserted on that copy, so it passed while
 * the real function corrupted HTML, while the API client called a route that
 * does not exist, and while the pageview pixel recorded nothing.
 *
 * Everything here is a fake with observable state, never a mock that asserts on
 * itself: $GLOBALS['bt_http'] records the requests the plugin actually made, and
 * assertions are made against those recorded requests and against real return
 * values.
 */

define('ABSPATH', __DIR__ . '/');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);

/** Mutable test state. Reset with bt_reset(). */
$GLOBALS['bt_options'] = array();
$GLOBALS['bt_transients'] = array();
$GLOBALS['bt_http'] = array();       // recorded outbound requests
$GLOBALS['bt_http_queue'] = array(); // canned responses, shifted per request
$GLOBALS['bt_actions'] = array();    // add_action/add_filter registrations
$GLOBALS['bt_shortcodes'] = array();
$GLOBALS['bt_conditionals'] = array(
    'is_admin' => false,
    'is_feed' => false,
    'is_preview' => false,
    'is_singular' => true,
    'in_the_loop' => true,
    'is_main_query' => true,
);

function bt_reset() {
    $GLOBALS['bt_options'] = array();
    $GLOBALS['bt_transients'] = array();
    $GLOBALS['bt_http'] = array();
    $GLOBALS['bt_http_queue'] = array();
    $GLOBALS['bt_actions'] = array();
    $GLOBALS['bt_shortcodes'] = array();
    $GLOBALS['bt_conditionals'] = array(
        'is_admin' => false,
        'is_feed' => false,
        'is_preview' => false,
        'is_singular' => true,
        'in_the_loop' => true,
        'is_main_query' => true,
    );
}

/** Queue the next HTTP response the plugin will receive. */
function bt_queue_response($code, $body) {
    $GLOBALS['bt_http_queue'][] = array('code' => $code, 'body' => $body);
}

/** Queue a transport-level failure (WP_Error). */
function bt_queue_error($message) {
    $GLOBALS['bt_http_queue'][] = array('error' => $message);
}

class WP_Error {
    private $message;
    public function __construct($message) {
        $this->message = $message;
    }
    public function get_error_message() {
        return $this->message;
    }
}

// --- Options / transients -------------------------------------------------

function get_option($name, $default = false) {
    return array_key_exists($name, $GLOBALS['bt_options']) ? $GLOBALS['bt_options'][$name] : $default;
}
function update_option($name, $value) {
    $GLOBALS['bt_options'][$name] = $value;
    return true;
}
function get_transient($key) {
    return array_key_exists($key, $GLOBALS['bt_transients']) ? $GLOBALS['bt_transients'][$key] : false;
}
function set_transient($key, $value, $ttl = 0) {
    $GLOBALS['bt_transients'][$key] = $value;
    return true;
}
function delete_transient($key) {
    unset($GLOBALS['bt_transients'][$key]);
    return true;
}

// --- HTTP -----------------------------------------------------------------

function wp_remote_get($url, $args = array()) {
    $GLOBALS['bt_http'][] = array('url' => $url, 'args' => $args);
    $next = array_shift($GLOBALS['bt_http_queue']);
    if ($next === null) {
        return array('code' => 200, 'body' => '[]');
    }
    if (isset($next['error'])) {
        return new WP_Error($next['error']);
    }
    return $next;
}
function wp_remote_retrieve_response_code($response) {
    return is_array($response) && isset($response['code']) ? $response['code'] : 0;
}
function wp_remote_retrieve_body($response) {
    return is_array($response) && isset($response['body']) ? $response['body'] : '';
}
function is_wp_error($thing) {
    return $thing instanceof WP_Error;
}

// --- Hooks ----------------------------------------------------------------

function add_action($hook, $callback, $priority = 10, $args = 1) {
    $GLOBALS['bt_actions'][] = array('type' => 'action', 'hook' => $hook, 'callback' => $callback);
}
function add_filter($hook, $callback, $priority = 10, $args = 1) {
    $GLOBALS['bt_actions'][] = array('type' => 'filter', 'hook' => $hook, 'callback' => $callback);
}
function add_shortcode($tag, $callback) {
    $GLOBALS['bt_shortcodes'][$tag] = $callback;
}
function add_options_page($a, $b, $c, $d, $e) {}
function register_setting($group, $name, $args = array()) {}
function settings_fields($group) {}
function submit_button($text = '') {}
function load_plugin_textdomain($a, $b, $c) {}
function plugin_dir_path($file) { return dirname($file) . '/'; }
function plugin_dir_url($file) { return 'https://example.test/wp-content/plugins/birtingur-ads/'; }
function plugin_basename($file) { return 'birtingur-ads/birtingur-ads.php'; }

// --- Conditionals ---------------------------------------------------------

function is_admin() { return $GLOBALS['bt_conditionals']['is_admin']; }
function is_feed() { return $GLOBALS['bt_conditionals']['is_feed']; }
function is_preview() { return $GLOBALS['bt_conditionals']['is_preview']; }
function is_singular($type = '') { return $GLOBALS['bt_conditionals']['is_singular']; }
function in_the_loop() { return $GLOBALS['bt_conditionals']['in_the_loop']; }
function is_main_query() { return $GLOBALS['bt_conditionals']['is_main_query']; }

// --- Sanitising / escaping -------------------------------------------------

function sanitize_text_field($str) { return trim(strip_tags((string) $str)); }
function sanitize_key($str) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $str)); }
function sanitize_html_class($str) { return preg_replace('/[^A-Za-z0-9_\-]/', '', (string) $str); }
function esc_attr($str) { return htmlspecialchars((string) $str, ENT_QUOTES, 'UTF-8'); }
function esc_html($str) { return htmlspecialchars((string) $str, ENT_QUOTES, 'UTF-8'); }
function esc_url($url) { return htmlspecialchars((string) $url, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($url) { return (string) $url; }
function esc_html__($text, $domain = '') { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); }
function rest_sanitize_boolean($v) { return (bool) $v; }
function wp_unslash($v) { return is_string($v) ? stripslashes($v) : $v; }
function trailingslashit($str) { return rtrim((string) $str, '/\\') . '/'; }
function __($text, $domain = '') { return $text; }
function checked($a, $b = true, $echo = true) { return $a == $b ? ' checked="checked"' : ''; }
// Quoting matters and is easy to get wrong in a fake: real WordPress's
// __checked_selected_helper() emits SINGLE quotes ("selected='selected'"). A
// double-quoted fake makes any test that asserts on the rendered attribute pass
// against a string that never appears in production.
function selected($a, $b = true, $echo = true) {
    $out = ((string) $a === (string) $b) ? " selected='selected'" : '';
    if ($echo) {
        echo $out;
    }
    return $out;
}
function shortcode_atts($pairs, $atts, $shortcode = '') {
    $atts = (array) $atts;
    $out = array();
    foreach ($pairs as $name => $default) {
        $out[$name] = array_key_exists($name, $atts) ? $atts[$name] : $default;
    }
    return $out;
}

// --- Admin ----------------------------------------------------------------

function current_user_can($cap) { return true; }
function wp_die($message) { throw new RuntimeException('wp_die: ' . $message); }
function check_admin_referer($action) { return true; }
function wp_nonce_url($url, $action) { return $url . '&_wpnonce=test'; }
function admin_url($path = '') { return 'https://example.test/wp-admin/' . $path; }
/**
 * Thrown by the wp_redirect fake so a test can intercept the redirect.
 *
 * The handlers call exit() immediately after wp_redirect(). A fake that merely
 * returned would let that exit() terminate the whole runner mid-suite — with
 * status 0, so the runner would report success having skipped every remaining
 * test. Throwing instead keeps control in the test.
 */
class BtRedirect extends RuntimeException {
    public $url;
    public function __construct($url) {
        $this->url = $url;
        parent::__construct('redirect: ' . $url);
    }
}

function wp_redirect($url) {
    throw new BtRedirect($url);
}
function add_query_arg($args, $url) { return $url . '?' . http_build_query($args); }

// --- Plugin under test ----------------------------------------------------

$plugin_dir = dirname(__DIR__);
define('BIRTINGUR_ADS_VERSION', '1.0.0');
define('BIRTINGUR_ADS_DEFAULT_SERVING_BASE', 'https://serving.birtingur.app');
define('BIRTINGUR_ADS_DEFAULT_API_BASE', 'https://api.birtingur.app');

require_once $plugin_dir . '/includes/class-birtingur-ads-api.php';
require_once $plugin_dir . '/includes/class-birtingur-ads-admin.php';
require_once $plugin_dir . '/includes/class-birtingur-ads-frontend.php';
require_once $plugin_dir . '/includes/class-birtingur-ads-shortcodes.php';
