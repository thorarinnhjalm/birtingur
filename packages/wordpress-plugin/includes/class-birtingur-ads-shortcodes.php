<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles shortcode registration and rendering.
 */
class BirtingurAdsShortcodes {
    public function __construct() {
        add_shortcode('birtingur_slot', array($this, 'render_shortcode'));
        add_shortcode('birtingur', array($this, 'render_shortcode')); // Alias
    }

    /**
     * Renders [birtingur_slot id="slot_xxx"]
     *
     * @param array $atts
     * @return string
     */
    public function render_shortcode($atts) {
        $atts = shortcode_atts(array(
            'id' => '',
            'class' => '',
        ), $atts, 'birtingur_slot');

        $slot_id = sanitize_text_field($atts['id']);
        if (empty($slot_id)) {
            return '<!-- Birtingur: Vantar id í stuttkóða -->';
        }

        // A container with no widget.js behind it renders nothing and reports
        // nothing. Say so in the page source rather than leaving a silent hole.
        if (!BirtingurAdsFrontend::is_configured()) {
            return '<!-- Birtingur: viðbótin er óstillt (Stillingar > Birtingur), birtingakóðinn hleðst ekki -->';
        }

        $classes = 'birtingur-ad-wrapper birtingur-shortcode ' . sanitize_html_class($atts['class']);

        return "\n<div class=\"" . esc_attr(trim($classes)) . "\" style=\"margin: 20px auto; text-align: center;\">\n" .
               '  <div data-adplatform-slot="' . esc_attr($slot_id) . '"></div>' . "\n" .
               "</div>\n";
    }
}
