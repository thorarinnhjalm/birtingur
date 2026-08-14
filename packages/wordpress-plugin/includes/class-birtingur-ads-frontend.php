<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles frontend script injection and content filtering.
 */
class BirtingurAdsFrontend {
    public function __construct() {
        add_action('wp_head', array($this, 'inject_serving_script'), 20);
        add_action('wp_footer', array($this, 'inject_pageview_pixel'), 50);
        add_filter('the_content', array($this, 'filter_content_ads'));
    }

    /**
     * Injects the async lightweight serving snippet.
     */
    public function inject_serving_script() {
        $publisher_id = get_option('birtingur_ads_publisher_id', '');
        if (empty($publisher_id)) {
            return;
        }

        $serving_base = get_option('birtingur_ads_serving_base', BIRTINGUR_ADS_DEFAULT_SERVING_BASE);
        $script_url = trailingslashit($serving_base) . 'widget.js';

        echo "\n<!-- Birtingur Ad Delivery Snippet -->\n";
        echo '<script src="' . esc_url($script_url) . '" async defer></script>' . "\n";
    }

    /**
     * Injects the cookieless true pageview tracking pixel.
     */
    public function inject_pageview_pixel() {
        $publisher_id = get_option('birtingur_ads_publisher_id', '');
        $enable_pageview = get_option('birtingur_ads_enable_pageview', true);

        if (empty($publisher_id) || !$enable_pageview) {
            return;
        }

        // Avoid tracking admin or feed previews
        if (is_admin() || is_feed() || is_preview()) {
            return;
        }

        $serving_base = get_option('birtingur_ads_serving_base', BIRTINGUR_ADS_DEFAULT_SERVING_BASE);
        $pixel_url = trailingslashit($serving_base) . 'v1/pageview?pub=' . urlencode($publisher_id);

        echo "\n<!-- Birtingur Traffic Measurement Pixel -->\n";
        echo '<img src="' . esc_url($pixel_url) . '" width="1" height="1" style="display:none;position:absolute;visibility:hidden;" alt="" aria-hidden="true" />' . "\n";
    }

    /**
     * Injects configured ad slots into post content.
     *
     * @param string $content
     * @return string
     */
    public function filter_content_ads($content) {
        if (!is_singular('post') || is_feed() || is_preview()) {
            return $content;
        }

        $slot_top = get_option('birtingur_ads_slot_top', '');
        $slot_middle = get_option('birtingur_ads_slot_middle', '');
        $middle_paragraph = get_option('birtingur_ads_middle_paragraph', 2);
        $slot_bottom = get_option('birtingur_ads_slot_bottom', '');

        // 1. Top slot
        if (!empty($slot_top)) {
            $top_html = $this->render_slot_container($slot_top, 'birtingur-slot-top');
            $content = $top_html . $content;
        }

        // 2. Middle slot
        if (!empty($slot_middle) && $middle_paragraph > 0) {
            $content = $this->inject_after_paragraph($content, $slot_middle, $middle_paragraph);
        }

        // 3. Bottom slot
        if (!empty($slot_bottom)) {
            $bottom_html = $this->render_slot_container($slot_bottom, 'birtingur-slot-bottom');
            $content = $content . $bottom_html;
        }

        return $content;
    }

    /**
     * Inserts an ad container after the specified paragraph index.
     *
     * @param string $content
     * @param string $slot_id
     * @param int $paragraph_index
     * @return string
     */
    public function inject_after_paragraph($content, $slot_id, $paragraph_index) {
        $closing_p = '</p>';
        $paragraphs = explode($closing_p, $content);
        $count = count($paragraphs);

        if ($count <= $paragraph_index) {
            return $content;
        }

        $ad_html = $this->render_slot_container($slot_id, 'birtingur-slot-middle');

        $output = '';
        foreach ($paragraphs as $index => $paragraph) {
            if (trim($paragraph)) {
                $output .= $paragraph . $closing_p;
            }

            // Paragraph index is 1-based for user friendliness
            if ($index + 1 === (int) $paragraph_index) {
                $output .= $ad_html;
            }
        }

        return $output;
    }

    /**
     * Renders standard Birtingur ad slot div.
     *
     * @param string $slot_id
     * @param string $class_name
     * @return string
     */
    public function render_slot_container($slot_id, $class_name = '') {
        $classes = 'birtingur-ad-wrapper ' . esc_attr($class_name);
        return "\n<div class=\"" . esc_attr(trim($classes)) . "\" style=\"margin: 24px auto; text-align: center;\">\n" .
               '  <div data-adplatform-slot="' . esc_attr($slot_id) . '"></div>' . "\n" .
               "</div>\n";
    }
}
