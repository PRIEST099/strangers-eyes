# Judge Mode sample photos: sources

All three base photos are **CC0 (public domain dedication)** files from Wikimedia Commons: two in Ljubljana, one in Berlin-Lichtenrade. CC0 needs no credit; we credit the authors anyway.
Changes made by this project (D-153, D-164): resized to 1600 px and 768 px, metadata stripped, **solid masks** drawn over people, adverts showing people and real number plates (judge-02 needed none), and a **drawn prop** added (a "LUCAS" name-tag lunchbox on judge-03). The prop, the fake vault and the pins (for each sample, a park and a square near it) are made up; no real person, home or school is shown.

| file | Commons file | author | licence |
|---|---|---|---|
| judge-01.jpg | [Ljubljana railway station 2026-01-22 01.jpg](https://commons.wikimedia.org/wiki/File:Ljubljana_railway_station_2026-01-22_01.jpg) | Leonhard Lenz | CC0 1.0 |
| judge-02.jpg | [Horstwalder Straße Straßenschild mit Bahnübergang.jpg](https://commons.wikimedia.org/wiki/File:Horstwalder_Stra%C3%9Fe_Stra%C3%9Fenschild_mit_Bahn%C3%BCbergang.jpg) | Sebastian Rittau | CC0 1.0 |
| judge-03.jpg | [Courtyard of Ljubljana Castle, Ljubljana, 2013.jpg](https://commons.wikimedia.org/wiki/File:Courtyard_of_Ljubljana_Castle,_Ljubljana,_2013.jpg) | DimiTalen | CC0 1.0 |

The attacker answers shipped with the samples (`*.advB.v1.json`, `*.advB.fixed.v1.json`) are **live recordings** of the cloud attacker (`gemini-3.5-flash-lite`, Nov 23 2026, the first answer per sample; D-161, D-164). The app replays them, labelled CACHED SAMPLE, only when the live attacker is unavailable. judge-03 had nothing removable to fix, so its `fixed` file repeats the first answer.
