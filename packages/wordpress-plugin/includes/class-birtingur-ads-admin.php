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

        register_setting('birtingur_ads_group', 'birtingur_ads_enable_pageview', array(
            'type' => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default' => true,
        ));

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

    public function handle_refresh_slots() {
        if (!current_user_can('manage_options')) {
            wp_die(__('Aðgangur bannaður.', 'birtingur-ads'));
        }

        check_admin_referer('birtingur_refresh_slots_nonce');

        $publisher_id = get_option('birtingur_ads_publisher_id', '');
        if (!empty($publisher_id)) {
            $this->api->clear_cache($publisher_id);
            $this->api->get_slots($publisher_id, true);
        }

        wp_redirect(add_query_arg(array('page' => 'birtingur-ads', 'refreshed' => '1'), admin_url('options-general.php')));
        exit;
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $publisher_id = get_option('birtingur_ads_publisher_id', '');
        $enable_pageview = get_option('birtingur_ads_enable_pageview', true);
        $slot_top = get_option('birtingur_ads_slot_top', '');
        $slot_middle = get_option('birtingur_ads_slot_middle', '');
        $middle_paragraph = get_option('birtingur_ads_middle_paragraph', 2);
        $slot_bottom = get_option('birtingur_ads_slot_bottom', '');

        $slots = array();
        if (!empty($publisher_id)) {
            $slots = $this->api->get_slots($publisher_id);
        }

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

            <?php if (isset($_GET['refreshed']) && $_GET['refreshed'] === '1') : ?>
                <div class="notice notice-success is-dismissible">
                    <p>Auglýsingapláss voru uppfærð úr Birting API.</p>
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
                            <th scope="row">Vefumferðarmæling</th>
                            <td>
                                <label for="birtingur_ads_enable_pageview">
                                    <input type="checkbox" id="birtingur_ads_enable_pageview" name="birtingur_ads_enable_pageview" value="1" <?php checked($enable_pageview, true); ?> />
                                    Virkja nákvæma vefumferðarmælingu (pageview tracking pixel)
                                </label>
                                <p class="description">Mælir raunverulegar síðuflettingar án þess að nota vafrakökur til að birta nákvæma tölfræði í mælaborðinu þínu.</p>
                            </td>
                        </tr>
                    </table>

                    <?php if (!empty($publisher_id)) : ?>
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
                                        <option value="">— Ekkert pláss valið —</option>
                                        <?php foreach ($slots as $slot) : ?>
                                            <option value="<?php echo esc_attr($slot['id']); ?>" <?php selected($slot_top, $slot['id']); ?>>
                                                <?php echo esc_html($slot['name'] . ' (' . implode(', ', array_map(function($s) { return $s['width'].'x'.$s['height']; }, $slot['sizes'] ?? array())) . ')'); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                    <p class="description">Birtist efst í færslum, beint fyrir ofan meginmál.</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="birtingur_ads_slot_middle">Inni í efni</label></th>
                                <td>
                                    <select id="birtingur_ads_slot_middle" name="birtingur_ads_slot_middle" class="regular-text">
                                        <option value="">— Ekkert pláss valið —</option>
                                        <?php foreach ($slots as $slot) : ?>
                                            <option value="<?php echo esc_attr($slot['id']); ?>" <?php selected($slot_middle, $slot['id']); ?>>
                                                <?php echo esc_html($slot['name'] . ' (' . implode(', ', array_map(function($s) { return $s['width'].'x'.$s['height']; }, $slot['sizes'] ?? array())) . ')'); ?>
                                            </option>
                                        <?php endforeach; ?>
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
                                        <option value="">— Ekkert pláss valið —</option>
                                        <?php foreach ($slots as $slot) : ?>
                                            <option value="<?php echo esc_attr($slot['id']); ?>" <?php selected($slot_bottom, $slot['id']); ?>>
                                                <?php echo esc_html($slot['name'] . ' (' . implode(', ', array_map(function($s) { return $s['width'].'x'.$s['height']; }, $slot['sizes'] ?? array())) . ')'); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                    <p class="description">Birtist neðst í færslum, beint fyrir neðan meginmál.</p>
                                </td>
                            </tr>
                        </table>
                    <?php else : ?>
                        <div style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-left: 4px solid #0284c7; border-radius: 4px;">
                            <p style="margin: 0; font-size: 13px; color: #0369a1;">
                                Sláðu inn Publisher ID hér að ofan og vistaðu stillingarnar til að tengja auglýsingaplássin þín sjálfkrafa.
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
