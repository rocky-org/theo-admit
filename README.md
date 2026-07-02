# Simulare admitere la liceu — Dolj 2026

Dashboard pentru estimarea șanselor la repartizarea computerizată în Dolj
(Evaluarea Națională 2026), cu țintă principală CN „Elena Cuza" Craiova.

**Pagina online:** https://rocky-org.github.io/theo-admit/

## Ce conține

- Curba ierarhiei județene cu pragurile liceelor țintă și poziția efectivă
- Șanse pe fiecare cod (istoricul pragurilor 2024/2025 din broșura ISJ + flux de locuri)
- Fișa de opțiuni recomandată, cu procent de reușită per opțiune
- Ipoteze ajustabile (preferința real/uman, plecări la militar/pedagogic/artă/sport)
- Statistici pe școlile de proveniență

## Rulare locală (cu buton de actualizare a datelor)

```
node server.js
```

apoi deschide http://localhost:7788. Butonul „Actualizează datele" descarcă
ierarhia curentă de pe evaluare.edu.ro și rescrie `dolj-hierarchy.csv` +
`docs/data.json`.

## Actualizarea paginii online

După o actualizare locală a datelor: commit + push (GitHub Desktop sau CLI).
GitHub Pages servește folderul `docs/`; varianta online e statică — încarcă
`docs/data.json` și ascunde butonul de refresh.

Sursa locurilor și pragurilor: broșura oficială ISJ Dolj 2026–2027
(`brosura-2026-2027.pdf`, pag. 12 și 18).
