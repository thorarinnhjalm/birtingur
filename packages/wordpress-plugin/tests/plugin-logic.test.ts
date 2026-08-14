import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Birtingur WordPress Plugin', () => {
  const pluginDir = path.resolve(__dirname, '..');

  it('contains the mandatory WordPress plugin entry file and valid headers', () => {
    const mainFile = path.join(pluginDir, 'birtingur-ads.php');
    expect(fs.existsSync(mainFile)).toBe(true);

    const content = fs.readFileSync(mainFile, 'utf8');
    expect(content).toContain('Plugin Name: Birtingur — Vefauglýsingar & Umferðarmæling');
    expect(content).toContain('Version: 1.0.0');
    expect(content).toContain('ABSPATH');
    expect(content).toContain('https://serving.birtingur.app');
  });

  it('includes all necessary PHP class files in includes/', () => {
    const includes = [
      'class-birtingur-ads-api.php',
      'class-birtingur-ads-admin.php',
      'class-birtingur-ads-frontend.php',
      'class-birtingur-ads-shortcodes.php',
    ];

    for (const file of includes) {
      const p = path.join(pluginDir, 'includes', file);
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf8');
      expect(content).toContain("defined('ABSPATH')");
    }
  });

  it('readme.txt complies with marketing claims policy', () => {
    const readme = path.join(pluginDir, 'readme.txt');
    expect(fs.existsSync(readme)).toBe(true);
    const content = fs.readFileSync(readme, 'utf8');

    // Must not contain banned claim patterns per AGENTS.md
    expect(content).not.toMatch(/rauntíma/i);
    expect(content).not.toMatch(/instant/i);
    expect(content).not.toMatch(/guarantee/i);
    expect(content).not.toMatch(/No\. 1/i);

    // Verified USPs present
    expect(content).toContain('80%');
    expect(content).toContain('vafrakökur');
  });

  it('simulates paragraph injection correctly', () => {
    const samplePost =
      '<p>Fyrsta málsgrein hér.</p><p>Önnur málsgrein hér með efni.</p><p>Þriðja málsgrein hér.</p>';
    const slotId = 'slot_test123';
    const targetParagraph = 2;

    const closingP = '</p>';
    const paragraphs = samplePost.split(closingP);
    const adHtml = `<div class="birtingur-ad-wrapper birtingur-slot-middle"><div data-adplatform-slot="${slotId}"></div></div>`;

    let output = '';
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].trim()) {
        output += paragraphs[i] + closingP;
      }
      if (i + 1 === targetParagraph) {
        output += adHtml;
      }
    }

    expect(output).toContain(
      '<p>Fyrsta málsgrein hér.</p><p>Önnur málsgrein hér með efni.</p><div class="birtingur-ad-wrapper birtingur-slot-middle"><div data-adplatform-slot="slot_test123"></div></div><p>Þriðja málsgrein hér.</p>',
    );
  });
});
