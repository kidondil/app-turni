# LAPS Turni

Applicazione Expo/React Native con backend FastAPI e MongoDB per gestire i turni della cooperativa.

Ogni turno è composto da tre persone:

- 1 Autista
- 1 Capoturno
- 1 Soccorritore

I turni sono Mattina (08:00-14:00), Pomeriggio (14:00-20:00) e Notte (20:00-08:00). Nella composizione manuale la stessa persona può coprire più fasce nello stesso giorno, comprese combinazioni eccezionali come Mattina e Notte. Dopo la notte vengono comunque rispettati un giorno di smontante e uno di riposo.

Ogni operatore accede con un PIN personale da 4 a 6 cifre. I PIN non vengono salvati in chiaro: il backend conserva soltanto un hash con salt e pepper. Il browser ricorda l'accesso sul dispositivo per un anno, salvo disconnessione volontaria o cancellazione dei dati del browser; cinque PIN errati bloccano temporaneamente nuovi tentativi.

L'amministratore può comporre manualmente ogni turno scegliendo insieme un Autista, un Capoturno e un Soccorritore. Dalla pagina del giorno si apre **Modifica squadra** per sostituire un componente; l'eliminazione dell'intera squadra è disponibile all'interno della modifica con una conferma esplicita. Gli scambi approvati restano visibili perché aggiornano direttamente l'assegnazione del turno.

Le date sono mostrate nel formato italiano `GG/MM/AAAA`. Per le ferie si può digitare il periodo oppure aprire il calendario e selezionare direttamente il primo e l'ultimo giorno. Ogni operatore può annullare una propria richiesta di ferie ancora attiva, anche se già approvata, purché il periodo non sia concluso. Può inoltre annullare uno scambio inviato finché è ancora in attesa; le richieste restano nello storico con lo stato **Annullata** o **Annullato**.

## Notifiche

L'app conserva uno storico interno delle notifiche, consultabile dalla campanella:

- una richiesta ferie avvisa i colleghi dello stesso gruppo professionale e l'amministratore, indicando soltanto nome e date;
- la generazione o rigenerazione dei turni avvisa tutti gli utenti;
- la motivazione delle ferie non viene inserita nelle notifiche destinate ai colleghi.

Le notifiche vengono aggiornate quando l'utente apre o ricarica l'app. Non sono notifiche di sistema e non compaiono sul telefono mentre l'app è chiusa.

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

In una nuova installazione il wizard iniziale richiede nome, gruppo e PIN di ogni operatore, oltre alla scelta dell’amministratore.

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
