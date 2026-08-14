<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles communication with Birtingur API.
 */
class BirtingurAdsApi {
    /**
     * Get slots for the configured publisher.
     * Uses transient cache for 10 minutes to prevent API hammering.
     *
     * @param string $publisher_id
     * @param bool $force_refresh
     * @return array
     */
    public function get_slots($publisher_id, $force_refresh = false) {
        if (empty($publisher_id)) {
            return array();
        }

        $cache_key = 'birtingur_slots_' . sanitize_key($publisher_id);

        if (!$force_refresh) {
            $cached = get_transient($cache_key);
            if ($cached !== false && is_array($cached)) {
                return $cached;
            }
        }

        $api_base = get_option('birtingur_ads_api_base', BIRTINGUR_ADS_DEFAULT_API_BASE);
        $url = trailingslashit($api_base) . 'v1/publishers/' . urlencode($publisher_id) . '/slots';

        $response = wp_remote_get($url, array(
            'timeout' => 5,
            'headers' => array(
                'Accept' => 'application/json',
                'User-Agent' => 'WordPress/BirtingurAds-' . BIRTINGUR_ADS_VERSION,
            ),
        ));

        if (is_wp_error($response)) {
            return array();
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            return array();
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!is_array($data)) {
            return array();
        }

        // Cache for 10 minutes
        set_transient($cache_key, $data, 10 * MINUTE_IN_SECONDS);

        return $data;
    }

    /**
     * Clear cached slots.
     */
    public function clear_cache($publisher_id) {
        if (!empty($publisher_id)) {
            delete_transient('birtingur_slots_' . sanitize_key($publisher_id));
        }
    }
}
