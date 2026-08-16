#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: "Completare LAPS Turni e rendere affidabili i flussi di turni, ferie e scambi"
## backend:
##   - task: "Validazione e modifica turni"
##     implemented: true
##     working: true
##     file: "backend/server.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: "NA"
##         agent: "main"
##         comment: "Aggiunto PUT /api/shifts/{id} e controlli per duplicati, ruolo, ferie e smontante/riposo."
##       - working: true
##         agent: "main"
##         comment: "Verificato con test API isolati: creazione, modifica, duplicati, date non valide, ferie e riposo post-notte."
##   - task: "Generazione mensile sicura per squadre da tre"
##     implemented: true
##     working: true
##     file: "backend/server.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: "NA"
##         agent: "main"
##         comment: "Generazione allineata a 1 Autista + 1 Capoturno + 1 Soccorritore, senza fallback che viola i riposi."
##       - working: true
##         agent: "main"
##         comment: "Verificati composizione 1+1+1, equità, continuità dei riposi tra mesi e sostituzione atomica del mese."
##   - task: "Vincoli ferie e scambi"
##     implemented: true
##     working: true
##     file: "backend/server.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: "NA"
##         agent: "main"
##         comment: "Aggiunti controlli su proprietà del turno, sovrapposizioni, ruoli e conflitti di assegnazione."
##       - working: true
##         agent: "main"
##         comment: "Verificati richieste sovrapposte, approvazione con turni esistenti, proprietà e accettazione degli scambi."
##   - task: "Autenticazione PIN e autorizzazioni"
##     implemented: true
##     working: true
##     file: "backend/server.py"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Verificati login, PIN errato, sessioni ruotate, permessi admin/operatore, reset PIN e migrazione senza perdita di turni."
## frontend:
##   - task: "Integrazione modifica turno"
##     implemented: true
##     working: true
##     file: "frontend/app/shift-new.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: "NA"
##         agent: "main"
##         comment: "Il frontend usava già PUT; ora il backend espone l'endpoint richiesto."
##       - working: true
##         agent: "main"
##         comment: "Lint e controllo TypeScript superati; export web statico completato con 20 route."
##   - task: "Generazione turni da interfaccia amministratore"
##     implemented: true
##     working: true
##     file: "frontend/app/generate-shifts.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Aggiunta schermata per generare o sostituire un mese; lint, typecheck ed export web superati."
##   - task: "Accesso e gestione PIN"
##     implemented: true
##     working: true
##     file: "frontend/app/index.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Aggiunti login PIN, migrazione dati esistenti, cambio PIN personale e reset PIN da parte dell’admin; lint e TypeScript superati."
## metadata:
##   created_by: "main_agent"
##   version: "1.3"
##   test_sequence: 5
##   run_ui: false
## test_plan:
##   current_focus: []
##   stuck_tasks: []
##   test_all: true
##   test_priority: "high_first"
## agent_communication:
##   - agent: "main"
##     message: "I vecchi test remoti sono stati esclusi perché modificano dati pubblici. Verranno sostituiti da test locali isolati con database in memoria."
##   - agent: "main"
##     message: "Suite finale: 9 test backend superati; lint e TypeScript senza errori; export web statico completato. I test sono locali e non modificano servizi esterni."
##   - agent: "main"
##     message: "Suite PIN/autorizzazioni integrata: 12 test backend superati; lint e TypeScript senza errori."
