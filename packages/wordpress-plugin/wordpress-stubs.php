<?php
/**
 * IDE Stub file for WordPress Core functions.
 * This file is only read by IDE linters and is never executed in production.
 */

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

if (!defined('MINUTE_IN_SECONDS')) {
    define('MINUTE_IN_SECONDS', 60);
}
if (!defined('HOUR_IN_SECONDS')) {
    define('HOUR_IN_SECONDS', 3600);
}
if (!defined('DAY_IN_SECONDS')) {
    define('DAY_IN_SECONDS', 86400);
}

if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) { return ''; }
}
if (!function_exists('plugin_dir_url')) {
    function plugin_dir_url($file) { return ''; }
}
if (!function_exists('plugin_basename')) {
    function plugin_basename($file) { return ''; }
}
if (!function_exists('add_action')) {
    function add_action($tag, $callback, $priority = 10, $accepted_args = 1) {}
}
if (!function_exists('add_filter')) {
    function add_filter($tag, $callback, $priority = 10, $accepted_args = 1) {}
}
if (!function_exists('add_shortcode')) {
    function add_shortcode($tag, $callback) {}
}
if (!function_exists('load_plugin_textdomain')) {
    function load_plugin_textdomain($domain, $deprecated = false, $plugin_rel_path = false) {}
}
if (!function_exists('add_options_page')) {
    function add_options_page($page_title, $menu_title, $capability, $menu_slug, $callback = '', $position = null) {}
}
if (!function_exists('register_setting')) {
    function register_setting($option_group, $option_name, $args = array()) {}
}
if (!function_exists('settings_fields')) {
    function settings_fields($option_group) {}
}
if (!function_exists('submit_button')) {
    function submit_button($text = null, $type = 'primary', $name = 'submit', $wrap = true, $other_attributes = null) {}
}
if (!function_exists('get_option')) {
    function get_option($option, $default = false) { return $default; }
}
if (!function_exists('update_option')) {
    function update_option($option, $value, $autoload = null) { return true; }
}
if (!function_exists('get_transient')) {
    function get_transient($transient) { return false; }
}
if (!function_exists('set_transient')) {
    function set_transient($transient, $value, $expiration = 0) { return true; }
}
if (!function_exists('delete_transient')) {
    function delete_transient($transient) { return true; }
}
if (!function_exists('wp_remote_get')) {
    function wp_remote_get($url, $args = array()) { return array(); }
}
if (!function_exists('wp_remote_retrieve_response_code')) {
    function wp_remote_retrieve_response_code($response) { return 200; }
}
if (!function_exists('wp_remote_retrieve_body')) {
    function wp_remote_retrieve_body($response) { return ''; }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) { return false; }
}
if (!function_exists('current_user_can')) {
    function current_user_can($capability, ...$args) { return true; }
}
if (!function_exists('wp_die')) {
    function wp_die($message = '', $title = '', $args = array()) {}
}
if (!function_exists('check_admin_referer')) {
    function check_admin_referer($action = -1, $query_arg = '_wpnonce') { return 1; }
}
if (!function_exists('wp_nonce_url')) {
    function wp_nonce_url($actionurl, $action = -1, $name = '_wpnonce') { return $actionurl; }
}
if (!function_exists('admin_url')) {
    function admin_url($path = '', $scheme = 'admin') { return ''; }
}
if (!function_exists('wp_redirect')) {
    function wp_redirect($location, $status = 302, $x_redirect_by = 'WordPress') { return true; }
}
if (!function_exists('add_query_arg')) {
    function add_query_arg(...$args) { return ''; }
}
if (!function_exists('trailingslashit')) {
    function trailingslashit($string) { return rtrim($string, '/\\') . '/'; }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($str) { return (string) $str; }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key($key) { return (string) $key; }
}
if (!function_exists('sanitize_html_class')) {
    function sanitize_html_class($class, $fallback = '') { return (string) $class; }
}
if (!function_exists('esc_attr')) {
    function esc_attr($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); }
}
if (!function_exists('esc_html')) {
    function esc_html($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); }
}
if (!function_exists('esc_url')) {
    function esc_url($url) { return (string) $url; }
}
if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url) { return (string) $url; }
}
if (!function_exists('rest_sanitize_boolean')) {
    function rest_sanitize_boolean($value) { return (bool) $value; }
}
if (!function_exists('checked')) {
    function checked($checked, $current = true, $display = true) {
        $result = ((string) $checked === (string) $current) ? "checked='checked'" : '';
        if ($display) echo $result;
        return $result;
    }
}
if (!function_exists('selected')) {
    function selected($selected, $current = true, $display = true) {
        $result = ((string) $selected === (string) $current) ? "selected='selected'" : '';
        if ($display) echo $result;
        return $result;
    }
}
if (!function_exists('is_admin')) {
    function is_admin() { return false; }
}
if (!function_exists('is_feed')) {
    function is_feed() { return false; }
}
if (!function_exists('is_preview')) {
    function is_preview() { return false; }
}
if (!function_exists('is_singular')) {
    function is_singular($post_types = '') { return true; }
}
if (!function_exists('shortcode_atts')) {
    function shortcode_atts($pairs, $atts, $shortcode = '') { return array_merge($pairs, (array) $atts); }
}
if (!function_exists('__')) {
    function __($text, $domain = 'default') { return (string) $text; }
}
