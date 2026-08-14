=== Birtingur — Vefauglýsingar & Umferðarmæling ===
Contributors: birtingur
Tags: ads, display ads, advertising, banner, monetisation, privacy, cookieless, iceland, revenue
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sjálfvirk innleiðing á vefborðum og kökulausri vefumferðarmælingu frá Birtingi.

== Description ==

Birtingur er íslenskt vefauglýsingakerfi sem tengir saman íslenska útgefendur og auglýsendur með einföldum hætti.

Með þessari viðbót getur þú tengt WordPress vefinn þinn við Birting án þess að þurfa að breyta þemakóða eða handrita HTML.

= Helstu eiginleikar =

* **Sjálfvirk inndæling á birtingakóða**: Hleður sjálfkrafa inn léttum birtingakóða (`widget.js`) án þess að hægja á vefnum.
* **Kökulaus birting og mæling**: Birtingakóðinn sér sjálfur um að telja birtingar, smelli og síðuflettingar á síðum með auglýsingaplássi, án þess að vista vafrakökur eða persónugreinanleg gögn.
* **Sjálfvirkar birtingarstöður**: Settu inn auglýsingar fyrir ofan efni, inni í efni (eftir N-ta málsgrein) eða fyrir neðan efni með einföldum stillingum.
* **Stuttkóðar (Shortcodes)**: Settu inn auglýsingapláss hvar sem er með `[birtingur_slot id="slot_auðkenni"]`.
* **Samstilling við Birting API**: Með útgefandalykli sækir viðbótin auglýsingaplássin þín svo þú getur valið þau úr fellilista.

== Installation ==

1. Farðu í **Viðbætur > Bæta við** í stjórnborði WordPress.
2. Hladdu upp `birtingur-ads.zip` skránni og smelltu á **Setja upp núna**.
3. Virkjaðu viðbótina.
4. Farðu í **Stillingar > Birtingur** og sláðu inn `Publisher ID` sem þú finnur í mælaborðinu á [birtingur.app](https://birtingur.app).
5. Notaðu stuttkóða í færslum, eða bættu við útgefandalykli (API-lykli) til að velja auglýsingapláss úr fellilista og setja þau sjálfkrafa í efnið.

== Frequently Asked Questions ==

= Hvað er Birtingur? =
Birtingur er íslenskt vefauglýsinganet þar sem útgefendur halda eftir 80% af tekjum.

= Notar kerfið vafrakökur (cookies)? =
Nei, birtingakerfið notar engar vafrakökur frá þriðja aðila.

= Hvernig fæ ég Publisher ID? =
Þú skráir vefinn þinn á [birtingur.app/midlar](https://birtingur.app/midlar) og færð úthlutað Publisher ID í stillingum.

== Changelog ==

= 1.0.0 =
* Fyrsta útgáfa af viðbótinni.
* Stuðningur við sjálfvirkar birtingarstöður í efni.
* Stuðningur við stuttkóða `[birtingur_slot]`.
* Samstilling auglýsingaplássa með útgefandalykli.
