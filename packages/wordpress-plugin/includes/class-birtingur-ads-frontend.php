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
        add_filter('the_content', array($this, 'filter_content_ads'));
    }

    /*
     * DELIBERATELY NO PAGEVIEW PIXEL HERE.
     *
     * An earlier version of this plugin injected its own
     * `<img src="{serving}/v1/pageview?pub={publisherId}">` into wp_footer. It
     * measured nothing. /v1/pageview reads `s` (slot id), `ts` and `sig`, bails
     * out immediately when `s` is missing, and then verifies an HMAC signature
     * over (pageview, slotId, token, ts). None of those were sent, so the
     * endpoint returned a perfectly valid 1x1 gif and recorded zero — no error
     * in the browser, none in the plugin, none server-side, while the publisher
     * had ticked a box that said their traffic was being counted.
     *
     * It cannot be repaired by adding the missing parameters either: the
     * signature is minted with SIGNING_SECRET, which is a serving-only secret.
     * Anything shipped to publishers that could build a valid pixel could also
     * forge unlimited traffic, which is the exact hole the signed-pixel work
     * closed.
     *
     * None of this is needed anyway. Page views are ALREADY measured: routes/ad.ts
     * returns a signed `pageviewPixel` with every ad response and widget.js — which
     * inject_serving_script loads below — fires it. Do not reintroduce a
     * hand-built pixel here.
     */

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
     * Injects configured ad slots into post content.
     *
     * @param string $content
     * @return string
     */
    public function filter_content_ads($content) {
        if (!is_singular('post') || is_feed() || is_preview()) {
            return $content;
        }

        // is_singular() describes the PAGE, not the loop iteration. Without these
        // two guards a theme that renders other posts' content on a single-post
        // page (related posts, "you might also like", any secondary WP_Query)
        // gets ads injected into each of them as well.
        if (!in_the_loop() || !is_main_query()) {
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
        $last_index = count($paragraphs) - 1;

        // Post has fewer paragraphs than the requested position: leave it alone.
        if ($last_index < (int) $paragraph_index) {
            return $content;
        }

        $ad_html = $this->render_slot_container($slot_id, 'birtingur-slot-middle');

        $output = '';
        foreach ($paragraphs as $index => $fragment) {
            // explode() eats the delimiter, so every fragment except the last one
            // needs its </p> put back. The LAST fragment is whatever trailed the
            // final </p> — a list, an image, a heading, a shortcode's output —
            // and giving it a closing tag it never had appended a stray </p> to
            // every post that did not happen to end on a paragraph.
            $output .= ($index === $last_index) ? $fragment : $fragment . $closing_p;

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
