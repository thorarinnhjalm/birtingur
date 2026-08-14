<?php
/**
 * Dependency-free test runner for the Birtingur WordPress plugin.
 *
 * No PHPUnit and no composer: this is the only PHP package in a pnpm monorepo,
 * and a second package manager for ~200 lines of assertions is not worth it.
 *
 * Run with `pnpm --filter @ada/wordpress-plugin test`, which shells out to php.
 * If php is missing the command FAILS rather than skipping — a test suite that
 * quietly reports success on a machine that cannot run it is worse than none,
 * and that is close to what this package shipped with.
 */

require_once __DIR__ . '/bootstrap.php';

$tests = 0;
$failures = array();

function it($name, callable $fn) {
    global $tests, $failures;
    $tests++;
    bt_reset();
    try {
        $fn();
        echo "  \033[32m✓\033[0m $name\n";
    } catch (Throwable $e) {
        $failures[] = array('name' => $name, 'message' => $e->getMessage());
        echo "  \033[31m×\033[0m $name\n      " . $e->getMessage() . "\n";
    }
}

function describe($name, callable $fn) {
    echo "\n$name\n";
    $fn();
}

function assert_same($expected, $actual, $note = '') {
    if ($expected !== $actual) {
        throw new RuntimeException(
            ($note ? $note . "\n      " : '') .
            'expected: ' . var_export($expected, true) . "\n      " .
            'actual:   ' . var_export($actual, true)
        );
    }
}

function assert_true($actual, $note = '') {
    if ($actual !== true) {
        throw new RuntimeException(($note ?: 'expected true') . ', got ' . var_export($actual, true));
    }
}

function assert_false($actual, $note = '') {
    if ($actual !== false) {
        throw new RuntimeException(($note ?: 'expected false') . ', got ' . var_export($actual, true));
    }
}

function assert_contains($needle, $haystack, $note = '') {
    if (strpos($haystack, $needle) === false) {
        throw new RuntimeException(
            ($note ? $note . "\n      " : '') .
            'expected to contain: ' . $needle . "\n      in: " . $haystack
        );
    }
}

function assert_not_contains($needle, $haystack, $note = '') {
    if (strpos($haystack, $needle) !== false) {
        throw new RuntimeException(
            ($note ? $note . "\n      " : '') .
            'expected NOT to contain: ' . $needle . "\n      in: " . $haystack
        );
    }
}

// =========================================================================

describe('Content injection', function () {
    it('inserts the ad container after the requested paragraph', function () {
        $frontend = new BirtingurAdsFrontend();
        $out = $frontend->inject_after_paragraph(
            '<p>Ein.</p><p>Tvö.</p><p>Þrjú.</p>',
            'slot_abc',
            2
        );
        assert_same(
            '<p>Ein.</p><p>Tvö.</p>' . $frontend->render_slot_container('slot_abc', 'birtingur-slot-middle') . '<p>Þrjú.</p>',
            $out
        );
    });

    it('does NOT append a stray </p> to content that trails the last paragraph', function () {
        // REGRESSION. The old implementation appended '</p>' to every non-empty
        // fragment of explode('</p>', ...), including the final one — which is
        // whatever followed the last paragraph. Every post ending in a list,
        // image, heading, blockquote or shortcode output got malformed markup.
        $frontend = new BirtingurAdsFrontend();
        $out = $frontend->inject_after_paragraph(
            '<p>Ein.</p><p>Tvö.</p><ul><li>Liður</li></ul>',
            'slot_abc',
            2
        );
        assert_true(substr($out, -strlen('<ul><li>Liður</li></ul>')) === '<ul><li>Liður</li></ul>',
            'content must end with the list exactly as written, got: ' . substr($out, -60));
        assert_same(2, substr_count($out, '</p>'), 'exactly the two real closing tags, no invented third');
    });

    it('leaves the post untouched when it has fewer paragraphs than requested', function () {
        $frontend = new BirtingurAdsFrontend();
        $content = '<p>Bara ein málsgrein.</p>';
        assert_same($content, $frontend->inject_after_paragraph($content, 'slot_abc', 3));
    });

    it('leaves content with no paragraphs at all untouched', function () {
        $frontend = new BirtingurAdsFrontend();
        $content = '<figure><img src="x.png" /></figure>';
        assert_same($content, $frontend->inject_after_paragraph($content, 'slot_abc', 1));
    });

    it('escapes the slot id into the container', function () {
        $frontend = new BirtingurAdsFrontend();
        $html = $frontend->render_slot_container('slot"><script>alert(1)</script>', 'x');
        assert_not_contains('<script>', $html, 'slot id must not break out of the attribute');
    });

    it('skips injection outside the main loop', function () {
        // is_singular() is a PAGE-level condition. Without in_the_loop() and
        // is_main_query(), a theme rendering related posts on a single-post page
        // got ads injected into each of them too.
        $frontend = new BirtingurAdsFrontend();
        update_option('birtingur_ads_slot_top', 'slot_top');
        $GLOBALS['bt_conditionals']['in_the_loop'] = false;
        assert_same('<p>Efni.</p>', $frontend->filter_content_ads('<p>Efni.</p>'));

        bt_reset();
        update_option('birtingur_ads_slot_top', 'slot_top');
        $GLOBALS['bt_conditionals']['is_main_query'] = false;
        assert_same('<p>Efni.</p>', $frontend->filter_content_ads('<p>Efni.</p>'));
    });

    it('injects the top slot inside the main loop', function () {
        $frontend = new BirtingurAdsFrontend();
        update_option('birtingur_ads_slot_top', 'slot_top');
        $out = $frontend->filter_content_ads('<p>Efni.</p>');
        assert_contains('data-adplatform-slot="slot_top"', $out);
    });
});

describe('No hand-built pageview pixel', function () {
    it('registers nothing on wp_footer', function () {
        // REGRESSION. The plugin used to inject its own
        // <img src="{serving}/v1/pageview?pub=..."> there. /v1/pageview requires
        // a slot id and an HMAC signature minted with SIGNING_SECRET, so it
        // returned a valid 1x1 gif and recorded nothing, silently, while the
        // settings screen told the publisher their traffic was being counted.
        // widget.js already fires a signed pageview pixel from the ad response.
        new BirtingurAdsFrontend();
        foreach ($GLOBALS['bt_actions'] as $registration) {
            assert_true($registration['hook'] !== 'wp_footer',
                'nothing may be registered on wp_footer');
        }
    });

    it('has no pixel-injecting method left to call', function () {
        assert_false(method_exists('BirtingurAdsFrontend', 'inject_pageview_pixel'),
            'inject_pageview_pixel must stay deleted');
    });

    it('still loads widget.js from the canonical serving origin', function () {
        $frontend = new BirtingurAdsFrontend();
        update_option('birtingur_ads_publisher_id', 'pub_123');
        ob_start();
        $frontend->inject_serving_script();
        $out = ob_get_clean();
        assert_contains('https://serving.birtingur.app/widget.js', $out);
        assert_not_contains('serve.birtingur.app', $out, 'the serve. host is not attached to anything');
        assert_not_contains('cdn.', $out, 'there is no CDN host');
    });
});

describe('API client', function () {
    it('calls /v1/publishers/me/slots with a Bearer token', function () {
        // REGRESSION. It used to call an unauthenticated
        // GET /v1/publishers/{id}/slots. That route does not exist, and the
        // whole /v1/publishers router is behind requireAuth + requireScope,
        // so production answered 401 to every single call.
        $api = new BirtingurAdsApi();
        bt_queue_response(200, '[]');
        $api->get_slots('ak_test_key');

        assert_same(1, count($GLOBALS['bt_http']));
        $request = $GLOBALS['bt_http'][0];
        assert_same('https://api.birtingur.app/v1/publishers/me/slots', $request['url']);
        assert_same('Bearer ak_test_key', $request['args']['headers']['Authorization']);
    });

    it('reports an error instead of an empty list when the key is rejected', function () {
        // The old client returned array() for every failure, so a 401 was
        // indistinguishable from "you have no ad slots" and the settings screen
        // rendered three empty dropdowns forever without saying why.
        $api = new BirtingurAdsApi();
        bt_queue_response(401, '{"error":"Unauthorized"}');
        $result = $api->get_slots('ak_bad');

        assert_false($result['ok']);
        assert_same(array(), $result['slots']);
        assert_contains('API-lykillinn', $result['error']);
    });

    it('reports an error when the network fails', function () {
        $api = new BirtingurAdsApi();
        bt_queue_error('Connection timed out');
        $result = $api->get_slots('ak_test_key');

        assert_false($result['ok']);
        assert_contains('Connection timed out', $result['error']);
    });

    it('reports an error when there is no key at all', function () {
        $api = new BirtingurAdsApi();
        $result = $api->get_slots('');
        assert_false($result['ok']);
        assert_same(0, count($GLOBALS['bt_http']), 'must not call the API without a key');
    });

    it('returns the parsed slots on success', function () {
        $api = new BirtingurAdsApi();
        bt_queue_response(200, '[{"id":"slot_1","name":"Toppur"}]');
        $result = $api->get_slots('ak_test_key');

        assert_true($result['ok']);
        assert_same('slot_1', $result['slots'][0]['id']);
        assert_same(null, $result['error']);
    });

    it('caches a success and does not call the API again', function () {
        $api = new BirtingurAdsApi();
        bt_queue_response(200, '[{"id":"slot_1"}]');
        $api->get_slots('ak_test_key');
        $api->get_slots('ak_test_key');
        assert_same(1, count($GLOBALS['bt_http']), 'second call must be served from the transient');
    });

    it('does NOT cache a failure, so a corrected key works immediately', function () {
        $api = new BirtingurAdsApi();
        bt_queue_response(401, '{}');
        bt_queue_response(200, '[{"id":"slot_1"}]');

        assert_false($api->get_slots('ak_key')['ok']);
        assert_true($api->get_slots('ak_key')['ok'], 'a failure must not be cached for 10 minutes');
    });

    it('keeps the API key itself out of the transient name', function () {
        $api = new BirtingurAdsApi();
        bt_queue_response(200, '[]');
        $api->get_slots('ak_super_secret_value');
        foreach (array_keys($GLOBALS['bt_transients']) as $key) {
            assert_not_contains('ak_super_secret_value', $key,
                'option/transient names end up in backups and debug output');
        }
    });
});

describe('Settings screen', function () {
    it('renders one option per slot, with the saved one selected', function () {
        $admin = new BirtingurAdsAdmin(new BirtingurAdsApi());
        $html = $admin->render_slot_options(
            array(
                array('id' => 'slot_1', 'name' => 'Toppur', 'sizes' => array(array('width' => 728, 'height' => 90))),
                array('id' => 'slot_2', 'name' => 'Hlið', 'sizes' => array()),
            ),
            'slot_2'
        );
        assert_contains('value="slot_1"', $html);
        assert_contains('Toppur (728x90)', $html);
        assert_contains('value="slot_2" selected="selected"', $html);
    });

    it('survives slots with no name, no sizes or a malformed shape', function () {
        $admin = new BirtingurAdsAdmin(new BirtingurAdsApi());
        $html = $admin->render_slot_options(
            array(
                array('id' => 'slot_bare'),
                array('name' => 'engin auðkenni'),
                'not an array',
                array('id' => 'slot_odd', 'sizes' => array('nonsense')),
            ),
            ''
        );
        assert_contains('value="slot_bare"', $html);
        assert_contains('value="slot_odd"', $html);
        assert_same(3, substr_count($html, '<option'), 'placeholder plus the two usable slots');
    });

    it('escapes a hostile slot name', function () {
        $admin = new BirtingurAdsAdmin(new BirtingurAdsApi());
        $html = $admin->render_slot_options(
            array(array('id' => 'slot_x', 'name' => '<script>alert(1)</script>')),
            ''
        );
        assert_not_contains('<script>', $html);
    });

    it('keeps the stored API key when the field is submitted empty', function () {
        // The field renders empty (it is a password input), so saving any other
        // setting would otherwise wipe the key.
        $admin = new BirtingurAdsAdmin(new BirtingurAdsApi());
        update_option('birtingur_ads_api_key', 'ak_existing');
        assert_same('ak_existing', $admin->sanitize_api_key(''));
        assert_same('ak_new', $admin->sanitize_api_key('ak_new'));
    });
});

describe('Shortcodes', function () {
    it('renders a slot container for [birtingur_slot id="..."]', function () {
        $shortcodes = new BirtingurAdsShortcodes();
        $html = $shortcodes->render_shortcode(array('id' => 'slot_abc'));
        assert_contains('data-adplatform-slot="slot_abc"', $html);
    });

    it('renders a comment, not markup, when the id is missing', function () {
        $shortcodes = new BirtingurAdsShortcodes();
        $html = $shortcodes->render_shortcode(array());
        assert_not_contains('data-adplatform-slot', $html);
    });

    it('escapes a hostile id', function () {
        $shortcodes = new BirtingurAdsShortcodes();
        $html = $shortcodes->render_shortcode(array('id' => '"><script>alert(1)</script>'));
        assert_not_contains('<script>', $html);
    });
});

describe('Release packaging', function () {
    it('never ships the IDE stub file, which redeclares WordPress core', function () {
        $build = file_get_contents(dirname(__DIR__) . '/build-zip.mjs');
        assert_not_contains('wordpress-stubs.php', $build);
    });

    it('builds a zip containing exactly the plugin files, and nothing lying around', function () {
        $dir = dirname(__DIR__);
        // A file-sync daemon leaves "name 2.php" duplicates in this tree on branch
        // switches. Copying includes/ wholesale shipped them, and a second
        // birtingur-ads*.php in the plugin root makes WordPress list a duplicate
        // plugin. Drop one in and prove the build ignores it.
        $stray = $dir . '/includes/class-birtingur-ads-api 999.php';
        file_put_contents($stray, "<?php // stray\n");

        try {
            exec('cd ' . escapeshellarg($dir) . ' && node build-zip.mjs 2>&1', $out, $status);
            assert_same(0, $status, 'build failed: ' . implode("\n", $out));

            exec('unzip -Z1 ' . escapeshellarg($dir . '/dist/birtingur-ads.zip'), $listing);
            $listing = implode("\n", $listing);

            assert_contains('birtingur-ads/birtingur-ads.php', $listing);
            assert_contains('birtingur-ads/includes/class-birtingur-ads-api.php', $listing);
            assert_not_contains('999', $listing, 'stray files must not be packaged');
            assert_not_contains('tests/', $listing);
        } finally {
            unlink($stray);
        }
    });

    it('refuses to build, loudly, when a plugin file is missing', function () {
        // The old script wrapped every copy in if (fs.existsSync(...)), so a
        // missing main file produced a valid-looking zip and printed success.
        $dir = dirname(__DIR__);
        $main = $dir . '/birtingur-ads.php';
        $backup = file_get_contents($main);
        unlink($main);

        try {
            exec('cd ' . escapeshellarg($dir) . ' && node build-zip.mjs 2>&1', $out, $status);
            assert_true($status !== 0, 'build must fail when the main plugin file is gone');
        } finally {
            file_put_contents($main, $backup);
        }
    });

    it('readme does not advertise the removed traffic pixel as a plugin feature', function () {
        $readme = file_get_contents(dirname(__DIR__) . '/readme.txt');
        assert_not_contains('Kökulaus vefumferðarmæling', $readme);
    });
});

// =========================================================================

echo "\n";
if (empty($failures)) {
    echo "\033[32m$tests passed\033[0m\n\n";
    exit(0);
}

echo "\033[31m" . count($failures) . ' of ' . $tests . " failed\033[0m\n\n";
exit(1);
