# LAPS Turni

Applicazione Expo/React Native con backend FastAPI e MongoDB per gestire i turni della cooperativa.

Ogni turno è composto da tre persone:

- 1 Autista
- 1 Capoturno
- 1 Soccorritore

I servizi sono Mattina (08:00-14:00), Pomeriggio (14:00-20:00), Trasporti (08:00-16:00) e Notte (20:00-08:00). Nella composizione manuale la stessa persona può coprire più fasce nello stesso giorno: per esempio `MP` corrisponde a Mattina + Pomeriggio e `T/N` a Trasporti + Notte. Sono ammesse anche combinazioni eccezionali come Mattina e Notte. Il giorno immediatamente successivo alla notte resta smontante.

Ogni operatore accede con un PIN personale da 4 a 6 cifre. I PIN non vengono salvati in chiaro: il backend conserva soltanto un hash con salt e pepper. Il browser ricorda l'accesso sul dispositivo per un anno, salvo disconnessione volontaria o cancellazione dei dati del browser; cinque PIN errati bloccano temporaneamente nuovi tentativi.

Gli amministratori possono comporre manualmente ogni turno scegliendo insieme un Autista, un Capoturno e un Soccorritore. Dalla pagina del giorno si apre **Modifica squadra** per sostituire un componente; l'eliminazione dell'intera squadra è disponibile all'interno della modifica con una conferma esplicita. Gli scambi approvati restano visibili perché aggiornano direttamente l'assegnazione del turno. Dalla pagina **Gestisci amministratori** si possono abilitare più persone contemporaneamente; l'app impedisce di rimuovere l'ultimo amministratore rimasto.

## Volontari

L'amministratore può creare anche profili con ruolo **Volontario** e PIN personale. I volontari sono sempre esclusi dalla generazione automatica, dalla copertura minima delle squadre, dalle ferie, dagli scambi e dalle statistiche degli operatori. Dal dettaglio di una giornata possono usare **Aggiungimi a questo turno** o **Ritirati dal turno** per Mattina, Pomeriggio, Trasporti e Notte, anche su più fasce. La loro presenza compare in una sezione distinta sotto l'equipaggio ordinario. L'amministratore può aggiungerli e rimuoverli manualmente dalla stessa schermata.

Dal Profilo, l'amministratore può inoltre aprire **Importa turni del mese** e caricare un CSV con le colonne `Data;Turno;Autista;Capoturno;Soccorritore`. L'app controlla nomi, gruppi, duplicati, ferie e smontanti, mostra l'anteprima giorno per giorno e richiede una conferma. Gli spazi interni ai nomi non incidono sul riconoscimento, quindi `Gianfranco` e `Gian Franco` sono equivalenti. Nell'importazione sono autorizzate anche le sostituzioni ricorrenti di Andrea Caddeo come Soccorritore e Lucia Murtas come Capoturno; per ogni altro operatore il controllo del gruppo resta invariato. La modalità normale aggiorna soltanto le squadre presenti nel file; l'opzione **Sostituisci tutto il mese** elimina prima i turni del mese selezionato, senza toccare utenti o ferie.

Le date sono mostrate nel formato italiano `GG/MM/AAAA`. Per le ferie si può digitare il periodo oppure aprire il calendario e selezionare direttamente il primo e l'ultimo giorno. Ogni operatore può annullare una propria richiesta di ferie ancora attiva, anche se già approvata, purché il periodo non sia concluso. Può inoltre annullare uno scambio inviato finché è ancora in attesa; le richieste restano nello storico con lo stato **Annullata** o **Annullato**.

## Tariffario trasporti

Dal Profilo ogni utente può aprire **Tariffario trasporti**, cercare una delle 66 località e vedere gli importi di Andata, Andata/Ritorno e Visita. I dati incorporati nell'app corrispondono al file **Tariffario Laps.xlsx**, aggiornato al 08/07/2026, con origine Cabras. Gli importi ufficiali prevalgono sempre sul calcolo proporzionale usato per le località non presenti.

Per una località assente dall'elenco, il backend cerca il paese in Sardegna con Nominatim/OpenStreetMap, calcola la distanza stradale da Cabras tramite OSRM e applica le stesse regole proporzionali del tariffario. Il risultato è sempre indicato come **Stima**, distinto dagli importi ufficiali. Se il servizio cartografico non è disponibile si possono inserire manualmente i chilometri. Le ricerche riuscite vengono memorizzate in MongoDB per ridurre le richieste ai servizi esterni.

## Saldo ferie

Nel Profilo degli operatori compare la statistica **Ferie residue**. Da **Gestisci saldi ferie** un amministratore inserisce per ciascun operatore il saldo iniziale e la data dalla quale è valido. L'app aggiunge 2,5 giorni a ogni cambio di mese, scala in giorni di calendario le ferie approvate già trascorse e mostra separatamente quelle future programmate. La nuova richiesta distingue **Ferie** e **Permesso**: i permessi non vengono scalati dal saldo ferie. Richieste rifiutate o annullate non incidono sul saldo. I saldi dei colleghi non sono esposti agli altri utenti; l'elenco completo è riservato agli amministratori. I volontari restano esclusi.

## Notifiche

L'app conserva uno storico interno delle notifiche in una schermata dedicata, accessibile dalla campanella. Ogni avviso ha un comando grande per segnarlo come letto ed è disponibile anche **Segna tutte come lette**:

- una richiesta ferie avvisa i colleghi dello stesso gruppo professionale e l'amministratore, indicando soltanto nome e date;
- la generazione o rigenerazione dei turni avvisa tutti gli utenti;
- la motivazione delle ferie non viene inserita nelle notifiche destinate ai colleghi.

Le notifiche vengono aggiornate quando l'utente apre o ricarica l'app. Non sono notifiche di sistema e non compaiono sul telefono mentre l'app è chiusa.

## Installazione PWA

Il frontend web è una Progressive Web App installabile senza Play Store o App Store. Su Android, quando il browser rende disponibile l'installazione, nella Home compare **Installa LAPS Turni**. Su iPhone compare una guida con i passaggi Safari → Condividi → Aggiungi alla schermata Home. Dopo l'installazione l'app usa l'icona ufficiale L.A.P.S. CARITAS nero/giallo e si apre a schermo intero. Gli aggiornamenti arrivano insieme ai normali deploy del frontend; i dati dei turni continuano a essere richiesti al backend e non vengono conservati offline dal service worker.

## Avvio del backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn server:app --reload
```

Configurare in `backend/.env`:

- `MONGO_URL` e `DB_NAME` per MongoDB;
- `CORS_ORIGINS` con gli indirizzi autorizzati del frontend;
- `PIN_PEPPER` con una stringa casuale lunga, da conservare stabilmente;
- `PIN_BOOTSTRAP_KEY` con un secondo codice casuale, necessario soltanto per migrare un'installazione già esistente.
- facoltativamente `GEOCODING_USER_AGENT` con un identificativo dell'app e un contatto; `NOMINATIM_BASE_URL` e `OSRM_BASE_URL` permettono di cambiare i servizi cartografici senza aggiornare l'app;
- facoltativamente `TRANSPORT_ORIGIN_LAT` e `TRANSPORT_ORIGIN_LON` per correggere il punto di partenza di Cabras usato nel calcolo stradale.

Per generare due valori casuali distinti:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Eseguire il comando due volte. Non aggiungere mai `.env` al repository e non cambiare `PIN_PEPPER` dopo che sono stati configurati i PIN.

## Avvio del frontend

```bash
cd frontend
npm ci
cp .env.example .env
npm run web
```

`EXPO_PUBLIC_BACKEND_URL` deve contenere l'indirizzo pubblico del backend, senza `/api` finale.

## Primo accesso e migrazione

In una nuova installazione il wizard iniziale richiede nome, gruppo e PIN di ogni operatore, oltre alla scelta di uno o più amministratori.

Se il database contiene già utenti creati con la vecchia versione, l’app apre automaticamente la schermata **Proteggi gli accessi**. Inserire il `PIN_BOOTSTRAP_KEY` configurato sul backend e assegnare un PIN a ciascun collega. Utenti, turni, ferie e scambi esistenti vengono conservati. Dopo la migrazione `PIN_BOOTSTRAP_KEY` può essere rimosso dall’ambiente del server; `PIN_PEPPER` deve invece rimanere invariato.

L’amministratore può creare utenti e reimpostare il PIN degli altri operatori. Ogni utente può cambiare il proprio PIN dal Profilo.

## Verifiche

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:web
```

Backend, con database esclusivamente in memoria:

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

La suite locale non contatta e non modifica il database di produzione.
