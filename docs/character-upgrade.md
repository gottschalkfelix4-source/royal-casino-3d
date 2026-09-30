# Menschenmodelle – 30. September 2026

Die bisherigen aus einfachen Körperformen aufgebauten Figuren sind durch drei angepasste MakeHuman-Menschenmodelle ersetzt. Sie haben zusammenhängende Gesichter und Hände, natürliche Körperproportionen, Haare, Schuhe und körpergerecht angepasste Anzüge. Die weibliche Variante trägt einen Hosenanzug, damit die sitzende Pose ohne die zuvor beobachtete Rockverformung funktioniert.

Die Modelle basieren auf CC0-Daten, nicht auf neu von Grund auf erstellter Topologie. Quellen, Lizenz, Einzeldatei-Prüfsummen und reproduzierbare Build-Schritte stehen in [der Asset-Dokumentation](../public/assets/characters/README.md). Die Animationen werden im Spiel über das Skelett berechnet; es sind keine Motion-Capture-Animationen. Die Darstellung ist ein deutlicher Schritt zu menschlichen Spielfiguren, aber kein fotorealistischer Scan.

## Darstellung und Laufzeit

- Drei Körper-/Gesichtsvarianten, 1,70–1,83 Meter groß, mit 103 Gelenken pro Person.
- Stehen, geschwindigkeitsabhängiges Gehen, Sitzen, Blickbewegung, Blinzeln und Kartenverteilen. Arme und Beine verwenden Zweigelenk-IK; Hände und Füße sind an Tisch und Sitzhöhe angepasst.
- Etwa 36–40 Tausend Dreiecke aus der Nähe, 11–12 Tausend ab elf Metern Entfernung. Beide Detailstufen teilen sich ein Skelett pro Person. Verschiedene Personen haben unabhängige Posen und Materialien.
- Geometrien und Texturen werden zwischen Personen geteilt. Die gesamten Modell- und Texturdateien benötigen rund 7,2 MB und werden lokal ausgeliefert.
- Bestehende Avatar-Aufrufe bleiben kompatibel. Ein fehlgeschlagener Modelldownload blockiert den Spielstart nicht; bei komplett fehlenden Modellen erscheint ein Hinweis zum Neuladen.

## Prüfung

20 automatisierte Tests bestehen. Die neuen Tests prüfen unter anderem GLB-Prüfsummen, Indizes, normalisierte Hautgewichte, Detailstufen, lokale Texturen und endliche Skeletttransformationen durch alle Posen. Ein separater IK-Test prüft erreichbare Ziele unter einer verschobenen und gedrehten Elterntransformation.

Im Browser bestehen 68 Spielwechsel: alle 17 Spiele in Hoch, Mittel, Niedrig und erneut Hoch. Zusätzliche Prüfungen bestätigen unabhängige Posen und Materialien, gemeinsam genutzte Geometrien und Texturen sowie ein Skelett pro Person über beide Detailstufen. Keine Browserfehler oder Konsolenwarnungen. Am Ende bleibt genau ein Canvas und ein Hallen-Updater. [Messprotokoll](character-evidence/game-mounts.json).

Die lokale Hallenmessung bei 1280 × 720, DPR 1, hoher Qualität und SMAA liefert 9,1 ms Median und 11,8 ms im 95. Perzentil; die vorherige Grafikversion lag bei 9,5 / 12,7 ms. Die CPU-Einreichungszeit liegt bei 4,2 statt 4,3 ms. Das zeigt in dieser Szene keinen messbaren Nachteil, ist wegen normaler Messschwankungen aber kein Nachweis einer Beschleunigung. Die Dreiecke pro gerendertem Frame steigen von 769.838 auf 883.172, die Draw Calls von 1.470 auf 1.495. Keine Aussage über andere Geräte oder eine größere Spielerzahl. [Aktuelle Messwerte](character-evidence/high-metrics.json), [vorherige Messwerte](graphics-polish-evidence/after-metrics.json).

## Bilder und Vorschau

- [Alle Figuren](character-evidence/characters.png)
- [Gesicht im Detail](character-evidence/portrait-man.png)
- [Im Casino am Tisch](character-evidence/casino-table.png)
- [Hallenansicht](character-evidence/casino-hall.png)

Mit `npm run test:graphics` stehen die lokale Modellvorschau unter `/__characters.html`, der Hallentest unter `/__review.html` und die Spielwechselprüfung unter `/__qa.html` bereit. Die QA startet mit einer temporären Datenbank; diese Vorschauseiten gehören nicht zum normalen Server.
