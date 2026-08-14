<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles communication with the Birtingur API.
 */
class BirtingurAdsApi {
    /**
     * Fetch the publisher's ad slots.
     *
     * Returns a RESULT, not a bare array. The previous version returned an empty
     * array for every failure mode, so a 401 was indistinguishable from "this
     * account has no slots": the settings screen rendered three empty dropdowns
     * forever and said nothing. It was calling an unauthenticated
     * GET /v1/publishers/{id}/slots, which does not exist — the route is
     * /v1/publishers/me/slots and the whole router is behind requireAuth +
     * requireScope('publisher'), so production answered 401 every time.
     *
     * @param string $api_key       Publisher-scoped API key (ak_...).
     * @param bool   $force_refresh Skip the transient cache.
     * @return array {
     *     @type bool        $ok    Whether the call succeeded.
     *     @type array       $slots Slot objects (empty on failure).
     *     @type string|null $error Icelandic message for the admin screen.
     * }
     */
    public function get_slots($api_key, $force_refresh = false) {
        if (empty($api_key)) {
            return $this->failure(__('Enginn API-lykill vistaður.', 'birtingur-ads'));
        }

        $cache_key = $this->cache_key($api_key);

        if (!$force_refresh) {
            $cached = get_transient($cache_key);
            if (is_array($cached)) {
                return array('ok' => true, 'slots' => $cached, 'error' => null);
            }
        }

        $api_base = get_option('birtingur_ads_api_base', BIRTINGUR_ADS_DEFAULT_API_BASE);
        $url = trailingslashit($api_base) . 'v1/publishers/me/slots';

        $response = wp_remote_get($url, array(
            'timeout' => 8,
            'headers' => array(
                'Accept' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
                'User-Agent' => 'WordPress/BirtingurAds-' . BIRTINGUR_ADS_VERSION,
            ),
        ));

        if (is_wp_error($response)) {
            return $this->failure(
                sprintf(
                    /* translators: %s: network error message */
                    __('Náði ekki sambandi við Birting: %s', 'birtingur-ads'),
                    $response->get_error_message()
                )
            );
        }

        $code = (int) wp_remote_retrieve_response_code($response);

        if ($code === 401 || $code === 403) {
            return $this->failure(__('API-lykillinn var ekki samþykktur. Athugaðu að hann sé útgefandalykill og enn virkur.', 'birtingur-ads'));
        }

        if ($code !== 200) {
            return $this->failure(
                sprintf(
                    /* translators: %d: HTTP status code */
                    __('Birtingur svaraði með stöðu %d.', 'birtingur-ads'),
                    $code
                )
            );
        }

        $data = json_decode(wp_remote_retrieve_body($response), true);

        if (!is_array($data)) {
            return $this->failure(__('Fékk ólæsilegt svar frá Birting.', 'birtingur-ads'));
        }

        // Cache successes only. Caching a failure would hide a fixed API key for
        // ten minutes after the publisher corrected it.
        set_transient($cache_key, $data, 10 * MINUTE_IN_SECONDS);

        return array('ok' => true, 'slots' => $data, 'error' => null);
    }

    /**
     * Clear the cached slot list.
     *
     * @param string $api_key
     */
    public function clear_cache($api_key) {
        if (!empty($api_key)) {
            delete_transient($this->cache_key($api_key));
        }
    }

    /**
     * Transient key derived from a HASH of the key, never the key itself —
     * option names end up in wp_options, backups and debug output.
     *
     * @param string $api_key
     * @return string
     */
    private function cache_key($api_key) {
        return 'birtingur_slots_' . substr(md5($api_key), 0, 16);
    }

    /**
     * @param string $message
     * @return array
     */
    private function failure($message) {
        return array('ok' => false, 'slots' => array(), 'error' => $message);
    }
}
