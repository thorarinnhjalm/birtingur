<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles WordPress admin interface and settings.
 */
class BirtingurAdsAdmin {
    private $api;

    public function __construct(BirtingurAdsApi $api) {
        $this->api = $api;

        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_post_birtingur_refresh_slots', array($this, 'handle_refresh_slots'));
        add_action('admin_post_birtingur_remove_key', array($this, 'handle_remove_key'));
    }

    public function add_admin_menu() {
        add_options_page(
            'Birtingur Vefauglýsingar',
            'Birtingur',
            'manage_options',
            'birtingur-ads',
            array($this, 'render_settings_page')
        );
    }

    public function register_settings() {
        register_setting('birtingur_ads_group', 'birtingur_ads_publisher_id', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        register_setting('birtingur_ads_group', 'birtingur_ads_api_key', array(
            'type' => 'string',
            'sanitize_callback' => array($this, 'sanitize_api_key'),
            'default' => '',
        ));

        // birtingur_ads_api_base is DELIBERATELY not registered. register_setting
        // is what makes an option writable through options.php, and this option
        // decides where the publisher's API key gets POSTed — exposing that with
        // no field in the UI adds an attack surface and buys nothing. Override it
        // from wp-config.php instead (see BirtingurAdsApi::api_base).

        register_setting('birtingur_ads_group', 'birtingur_ads_slot_top', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        register_setting('birtingur_ads_group', 'birtingur_ads_slot_middle', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        register_setting('birtingur_ads_group', 'birtingur_ads_middle_paragraph', array(
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 2,
        ));

        register_setting('birtingur_ads_group', 'birtingur_ads_slot_bottom', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        register_setting('birtingur_ads_group', 'birtingur_ads_serving_base', array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => BIRTINGUR_ADS_DEFAULT_SERVING_BASE,
        ));
    }

    /**
     * Keeps the stored key when the field is submitted empty, so saving the form
     * without retyping the (masked) key does not silently wipe it.
     *
     * @param string $value
     * @return string
     */
    public function sanitize_api_key($value) {
        $value = trim(sanitize_text_field($value));
        if ($value === '') {
            return (string) get_option('birtingur_ads_api_key', '');
        }
        return $value;
    }

    public function handle_refresh_slots() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Aðgangur bannaður.', 'birtingur-ads'));
        }

        check_admin_referer('birtingur_refresh_slots_nonce');

        $api_key = get_option('birtingur_ads_api_key', '');
        $this->api->clear_cache($api_key);
        $result = $this->api->get_slots($api_key, true);

        // Report what actually happened. This used to redirect with
        // refreshed=1 unconditionally, so a failed refresh rendered the green
        // "slots were updated" notice next to the red error explaining that
        // they were not.
        wp_redirect(add_query_arg(
            array('page' => 'birtingur-ads', 'refreshed' => $result['ok'] ? '1' : '0'),
            admin_url('options-general.php')
        ));
        exit;
    }

    /**
     * Removes the stored API key.
     *
     * Needed because the key field is a password input that renders empty, and
     * sanitize_api_key() preserves the stored value on an empty submission — so
     * without this there was no way to remove a revoked key at all. A revoked
     * key is not inert: every load of this screen would fire a fresh 8-second
     * request and render an error the publisher could do nothing about.
     */
    public function handle_remove_key() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Aðgangur bannaður.', 'birtingur-ads'));
        }

        check_admin_referer('birtingur_remove_key_nonce');

        $api_key = get_option('birtingur_ads_api_key', '');
        $this->api->clear_cache($api_key);
        update_option('birtingur_ads_api_key', '');

        wp_redirect(add_query_arg(array('page' => 'birtingur-ads', 'key_removed' => '1'), admin_url('options-general.php')));
        exit;
    }

    /**
     * Builds the <option> list for a slot dropdown, fully escaped.
     *
     * Extracted from three byte-identical copies in the markup, and hardened:
     * the old copies read $slot['id'], $slot['name'] and $slot['sizes'] with no
     * guards. That was invisible only because the API call always failed and the
     * list was always empty; with real data an unnamed slot or a slot whose
     * sizes are shaped differently would emit PHP warnings straight into the
     * settings page.
     *
     * @param array  $slots
     * @param string $selected
     * @return string
     */
    public function render_slot_options($slots, $selected) {
        $out = '<option value="">' . esc_html__('— Ekkert pláss valið —', 'birtingur-ads') . '</option>';

        if (!is_array($slots)) {
            return $out;
        }

        foreach ($slots as $slot) {
            if (!is_array($slot) || empty($slot['id'])) {
                continue;
            }
            $id = (string) $slot['id'];
            $out .= '<option value="' . esc_attr($id) . '"' . selected($selected, $id, false) . '>'
                 . esc_html($this->slot_label($slot))
                 . '</option>';
        }

        return $out;
    }

    /**
     * Human label for a slot: "Name (728x90, 300x250)", falling back to the id
     * when the slot has no name and omitting the parentheses when it has no
     * usable sizes.
     *
     * @param array $slot
     * @return string
     */
    public function slot_label($slot) {
        $name = (isset($slot['name']) && $slot['name'] !== '')
            ? (string) $slot['name']
            : (string) $slot['id'];

        $sizes = array();
        $raw_sizes = (isset($slot['sizes']) && is_array($slot['sizes'])) ? $slot['sizes'] : array();
        foreach ($raw_sizes as $size) {
            if (is_array($size) && isset($size['width'], $size['height'])) {
                $sizes[] = $size['width'] . 'x' . $size['height'];
            }
        }

        return empty($sizes) ? $name : $name . ' (' . implode(', ', $sizes) . ')';
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $publisher_id = get_option('birtingur_ads_publisher_id', '');
        $api_key = get_option('birtingur_ads_api_key', '');
        $slot_top = get_option('birtingur_ads_slot_top', '');
        $slot_middle = get_option('birtingur_ads_slot_middle', '');
        $middle_paragraph = get_option('birtingur_ads_middle_paragraph', 2);
        $slot_bottom = get_option('birtingur_ads_slot_bottom', '');

        $result = $this->api->get_slots($api_key);
        $slots = $result['slots'];
        $sync_error = $result['ok'] ? null : $result['error'];

        ?>
        <div class="wrap" style="max-width: 840px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <h1 style="display: flex; align-items: center; gap: 10px;">
                    <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: #2563eb;"></span>
                    Birtingur — Vefauglýsingar
                </h1>
                <a href="https://birtingur.app/publisher" target="_blank" rel="noopener noreferrer" class="button button-secondary">
                    Opna mælaborð Birtingar &rarr;
                </a>
            </div>

            <?php
            // phpcs:disable WordPress.Security.NonceVerification.Recommended
            $refreshed = isset($_GET['refreshed']) ? sanitize_text_field(wp_unslash($_GET['refreshed'])) : null;
            $key_removed = isset($_GET['key_removed']) && sanitize_text_field(wp_unslash($_GET['key_removed'])) === '1';
            // phpcs:enable WordPress.Security.NonceVerification.Recommended
            ?>
            <?php if ($refreshed === '1') : ?>
                <div class="notice notice-success is-dismissible">
                    <p>Auglýsingapláss voru uppfærð úr Birting API.</p>
                </div>
            <?php elseif ($refreshed === '0') : ?>
                <div class="notice notice-error is-dismissible">
                    <p>Ekki tókst að uppfæra auglýsingapláss. Sjá skýringu hér að neðan.</p>
                </div>
            <?php endif; ?>

            <?php if ($key_removed) : ?>
                <div class="notice notice-success is-dismissible">
                    <p>API-lykillinn var fjarlægður.</p>
                </div>
            <?php endif; ?>

            <div class="card" style="margin-top: 15px; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <form method="post" action="options.php">
                    <?php settings_fields('birtingur_ads_group'); ?>

                    <h2 style="font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 0;">
                        1. Aðgangur útgefanda
                    </h2>
                    <table class="form-table">
                        <tr>
                            <th scope="row"><label for="birtingur_ads_publisher_id">Publisher ID</label></th>
                            <td>
                                <input type="text" id="birtingur_ads_publisher_id" name="birtingur_ads_publisher_id" value="<?php echo esc_attr($publisher_id); ?>" class="regular-text" placeholder="pub_xxxxxxxxxxxx" />
                                <p class="description">Þú finnur Publisher ID auðkennið þitt í stillingum á <a href="https://birtingur.app/publisher/settings" target="_blank">birtingur.app</a>.</p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="birtingur_ads_api_key">API-lykill</label></th>
                            <td>
                                <input type="password" id="birtingur_ads_api_key" name="birtingur_ads_api_key" value="" class="regular-text" autocomplete="off" placeholder="<?php echo $api_key ? esc_attr(str_repeat('•', 12) . substr($api_key, -4)) : 'ak_...'; ?>" />
                                <p class="description">
                                    Valfrjálst. Þarf aðeins til að sækja auglýsingaplássin þín sjálfkrafa í fellilistana hér að neðan.
                                    Búðu til útgefandalykil í stillingum á <a href="https://birtingur.app/publisher/settings" target="_blank" rel="noopener noreferrer">birtingur.app</a>.
                                    <?php if ($api_key) : ?>
                                        <br /><strong>Lykill er vistaður.</strong> Skildu reitinn eftir auðan til að halda honum óbreyttum, eða
                                        <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=birtingur_remove_key'), 'birtingur_remove_key_nonce')); ?>">fjarlægðu lykilinn</a>.
                                    <?php endif; ?>
                                </p>
                            </td>
                        </tr>
                    </table>

                    <?php if ($sync_error && $api_key) : ?>
                        <div class="notice notice-error inline" style="margin: 15px 0;">
                            <p><strong>Náði ekki í auglýsingapláss:</strong> <?php echo esc_html($sync_error); ?></p>
                        </div>
                    <?php endif; ?>

                    <?php if (!empty($api_key)) : ?>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                            <h2 style="font-size: 16px; margin: 0;">2. Sjálfvirkar birtingarstöður í færslum</h2>
                            <a href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=birtingur_refresh_slots'), 'birtingur_refresh_slots_nonce')); ?>" class="button button-small">
                                Endurhlaða pláss úr API
                            </a>
                        </div>

                        <table class="form-table">
                            <tr>
                                <th scope="row"><label for="birtingur_ads_slot_top">Fyrir ofan efni</label></th>
                                <td>
                                    <select id="birtingur_ads_slot_top" name="birtingur_ads_slot_top" class="regular-text">
                                        <?php
                                        // Escaped inside render_slot_options().
                                        echo $this->render_slot_options($slots, $slot_top); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                                        ?>
                                    </select>
                                    <p class="description">Birtist efst í færslum, beint fyrir ofan meginmál.</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="birtingur_ads_slot_middle">Inni í efni</label></th>
                                <td>
                                    <select id="birtingur_ads_slot_middle" name="birtingur_ads_slot_middle" class="regular-text">
                                        <?php
                                        // Escaped inside render_slot_options().
                                        echo $this->render_slot_options($slots, $slot_middle); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                                        ?>
                                    </select>
                                    <div style="margin-top: 8px;">
                                        Setja eftir málsgrein nr.:
                                        <input type="number" name="birtingur_ads_middle_paragraph" value="<?php echo esc_attr($middle_paragraph); ?>" min="1" max="20" style="width: 60px;" />
                                    </div>
                                    <p class="description">Birtist sjálfkrafa á milli málsgreina í lengri greinum.</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="birtingur_ads_slot_bottom">Fyrir neðan efni</label></th>
                                <td>
                                    <select id="birtingur_ads_slot_bottom" name="birtingur_ads_slot_bottom" class="regular-text">
                                        <?php
                                        // Escaped inside render_slot_options().
                                        echo $this->render_slot_options($slots, $slot_bottom); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                                        ?>
                                    </select>
                                    <p class="description">Birtist neðst í færslum, beint fyrir neðan meginmál.</p>
                                </td>
                            </tr>
                        </table>
                    <?php else : ?>
                        <div style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-left: 4px solid #0284c7; border-radius: 4px;">
                            <p style="margin: 0; font-size: 13px; color: #0369a1;">
                                Sláðu inn API-lykil hér að ofan og vistaðu stillingarnar til að velja auglýsingapláss úr fellilista.
                                Án lykils virka stuttkóðarnir hér að neðan áfram.
                            </p>
                        </div>
                    <?php endif; ?>

                    <h2 style="font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 30px;">
                        3. Handvirk staðsetning með stuttkóða (Shortcodes)
                    </h2>
                    <p>Þú getur sett auglýsingaborða hvar sem er í síðum, færslum eða hliðarstikum með því að nota eftirfarandi stuttkóða:</p>
                    <code style="display: inline-block; padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-family: monospace;">[birtingur_slot id="slot_auðkenni"]</code>

                    <?php submit_button('Vista stillingar'); ?>
                </form>
            </div>
        </div>
        <?php
    }
}
