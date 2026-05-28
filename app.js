// Stato dell'applicazione con valori di default su Ponte di Piave (Treviso)
const state = {
    lat: 45.7272,       // Latitudine Ponte di Piave
    lon: 12.4632,       // Longitudine Ponte di Piave
    manualHeading: 0,   // Orientamento della bussola solare impostato dall'utente
    magneticHeading: null, // Bussola magnetica hardware reale (per freccia blu)
    tiltX: 0,           // Inclinazione sinistra/destra (Gamma)
    tiltY: 0,           // Inclinazione avanti/indietro (Beta)
    smoothTiltX: 0,     // Valori smorzati per la fisica della bolla
    smoothTiltY: 0,
    hasHardwareSensors: false,
    sun: {
        azimuth: 180,
        altitude: 45,
        calculated: false
    },
    isDragging: false,
    dragStartAngle: 0,
    dragStartHeading: 0
};

const canvas = document.getElementById('dialCanvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');

// Elementi DOM di stato
const lblAzimut = document.getElementById('lbl-azimut');
const lblAltezza = document.getElementById('lbl-altezza');
const lblPos = document.getElementById('lbl-pos');
const txtTiltX = document.getElementById('txt-tilt-x');
const txtTiltY = document.getElementById('txt-tilt-y');

// Bottoni e controlli per coordinate
const btnSensors = document.getElementById('btn-sensors');
const btnGpsTrigger = document.getElementById('btn-gps-trigger');
const inputLat = document.getElementById('input-lat');
const inputLon = document.getElementById('input-lon');
const helpAlert = document.getElementById('help-alert');
const statusBadge = document.getElementById('status-badge');

// Elementi diagnostica
const diagHttpsIcon = document.getElementById('diag-https-icon');
const diagHttpsVal = document.getElementById('diag-https-val');
const diagSensorsIcon = document.getElementById('diag-sensors-icon');
const diagSensorsVal = document.getElementById('diag-sensors-val');

// --- RIDIMENSIONAMENTO E DENSITY PIXELS DEL CANVAS ---
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    draw();
}

// --- SISTEMA DIAGNOSTICO INIZIALE ---
function eseguiDiagnostica() {
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';

    if (isSecure) {
        diagHttpsIcon.textContent = "🟢";
        diagHttpsVal.textContent = "SICURA (HTTPS)";
        diagHttpsVal.className = "text-right font-bold text-emerald-400";
    } else {
        diagHttpsIcon.textContent = "🔴";
        diagHttpsVal.textContent = "NON SICURA (HTTP)";
        diagHttpsVal.className = "text-right font-bold text-rose-500";
        helpAlert.innerHTML = "⚠️ <b>Attenzione</b>: Non sei in connessione sicura HTTPS. I telefoni bloccano l'accesso ai sensori su pagine non criptate. Verrà usata la <b>modalità di test/simulatore</b>.";
        helpAlert.classList.remove('hidden');
        statusBadge.textContent = "Demo / Simulatore";
        statusBadge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/25 text-amber-400 border border-amber-500/30";
    }

    const supportaSensori = (typeof DeviceOrientationEvent !== 'undefined');
    if (supportaSensori) {
        diagSensorsIcon.textContent = "🟡";
        diagSensorsVal.textContent = "SUPPORTATO (BLOCCATO)";
        diagSensorsVal.className = "text-right font-bold text-amber-400";
        helpAlert.classList.remove('hidden');
    } else {
        diagSensorsIcon.textContent = "🔴";
        diagSensorsVal.textContent = "NON SUPPORTATO";
        diagSensorsVal.className = "text-right font-bold text-rose-500";
        statusBadge.textContent = "Demo / Simulatore";
        statusBadge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700";
    }
}

// --- ALGORITMO CALCOLO SOLE IN TEMPO REALE ---
function calcolaPosizioneSole() {
    const now = new Date();
    const latRad = state.lat * Math.PI / 180;
    const lonRad = state.lon * Math.PI / 180;

    const julianDate = (now.getTime() / 86400000) + 2440587.5;
    const t = (julianDate - 2451545.0) / 36525.0; // Secoli giuliani da J2000

    // Anomalia media geometrica del Sole
    let gma = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    gma = (gma % 360) * Math.PI / 180;

    // Longitudine media geometrica del Sole
    let gml = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;

    // Equazione del centro
    let eqCenter = Math.sin(gma) * (1.914602 - t * (0.004817 + 0.000014 * t))
                 + Math.sin(2 * gma) * (0.019993 - 0.000101 * t)
                 + Math.sin(3 * gma) * 0.000289;

    let trueLongRad = (gml + eqCenter) * Math.PI / 180;
    let meanObliqRad = (23.439291 - t * (46.815 / 3600)) * Math.PI / 180;

    // Coordinate equatoriali solari (Ascensione Retta e Declinazione)
    let ra = Math.atan2(Math.cos(meanObliqRad) * Math.sin(trueLongRad), Math.cos(trueLongRad));
    let declinationRad = Math.asin(Math.sin(meanObliqRad) * Math.sin(trueLongRad));

    // Tempo Siderale di Greenwich
    let d = (julianDate - 2451545.0);
    let gmst = (280.46061837 + 360.98564736629 * d) % 360;

    // Angolo orario solare locale
    let lstRad = (gmst + state.lon) * Math.PI / 180;
    let haRad = Math.atan2(Math.sin(lstRad - ra), Math.cos(lstRad - ra));

    // Altezza del Sole
    let sinAlt = Math.sin(latRad) * Math.sin(declinationRad) + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(haRad);
    state.sun.altitude = Math.asin(sinAlt) * 180 / Math.PI;

    // Azimut del Sole
    let y = -Math.sin(haRad) * Math.cos(declinationRad);
    let x = Math.cos(latRad) * Math.sin(declinationRad) - Math.sin(latRad) * Math.cos(declinationRad) * Math.cos(haRad);
    state.sun.azimuth = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    state.sun.calculated = true;

    // Aggiornamento etichette testuali
    lblAzimut.textContent = `${state.sun.azimuth.toFixed(1)}°`;
    lblAltezza.textContent = `${state.sun.altitude.toFixed(1)}°`;
}

// --- FUNZIONE DI AGGIORNAMENTO BOLLA LIVELLA ---
function updateLevelBubble() {
    const damping = 0.2;
    state.smoothTiltX += (state.tiltX - state.smoothTiltX) * damping;
    state.smoothTiltY += (state.tiltY - state.smoothTiltY) * damping;
}

// --- RENDERING CANVAS (BUSSOLA + SOLE + OMBRA + LIVELLA + LINEA NORD LUNGA + NORD MAGNETICO SOFT) ---
function draw() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.44;

    // Pulisci l'area di disegno
    ctx.clearRect(0, 0, w, h);

    const curHeading = state.manualHeading;

    // --- DISEGNO DELLA LINEA ROSSA DEL NORD ESTESA ALL'INTERO SCHERMO ---
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Rosso neon soft per il tratteggio esterno
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, 0); // Da sopra lo schermo
    ctx.lineTo(cx, h); // Fino a sotto lo schermo
    ctx.stroke();
    ctx.restore();

    // --- DISEGNO DEL NORD MAGNETICO PASSIVO (FRECCIA BLU POCO VISTOSA) ---
    // Questa freccia ruota rispetto al Nord astronomico manuale impostato dall'utente.
    // Indica la direzione del Nord Magnetico reale se il sensore è attivo.
    if (state.magneticHeading !== null) {
        ctx.save();
        ctx.translate(cx, cy);
        
        // Calcolo dell'angolo magnetico relativo all'orientamento manuale corrente della meridiana
        // La freccia magnetica deve indicare la differenza tra l'inclinazione del telefono e il nord reale.
        const magAngleRad = (state.magneticHeading - curHeading) * Math.PI / 180;
        
        ctx.rotate(magAngleRad);

        // Disegno di una freccia blu neon sottile e poco vistosa
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)'; // Cyan/Blu trasparente e morbido
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]); // Linea tratteggiata per non confondersi con la linea di mira
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r + 28);
        ctx.stroke();
        ctx.setLineDash([]); // Ripristina linea continua

        // Punta della freccia blu magnetica
        ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, -r + 14);
        ctx.lineTo(-4, -r + 24);
        ctx.lineTo(4, -r + 24);
        ctx.closePath();
        ctx.fill();

        // Piccolo testo indicante il Nord Magnetico
        ctx.fillStyle = 'rgba(6, 182, 212, 0.8)';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N. MAGNETICO', 0, -r + 8);

        ctx.restore();
    }

    // --- 1. DISEGNO DEL QUADRANTE ROTANTE DELLA BUSSOLA ---
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-curHeading * Math.PI / 180); // Ruota la bussola coerentemente col trascinamento dell'utente

    // Sfondo della bussola
    ctx.strokeStyle = '#475569'; // ardesia
    ctx.lineWidth = 3;
    ctx.fillStyle = '#0f172a'; // slate-900 (ultra scuro per contrasto con l'ombra gialla!)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Cerchi di riferimento concentrici
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    [0.35, 0.65, 0.85].forEach(scale => {
        ctx.beginPath();
        ctx.arc(0, 0, r * scale, 0, 2 * Math.PI);
        ctx.stroke();
    });

    // Tacche di graduazione dei gradi
    for (let deg = 0; deg < 360; deg += 10) {
        const angle = deg * Math.PI / 180;
        const isMajor = deg % 30 === 0;
        ctx.strokeStyle = isMajor ? '#64748b' : '#334155';
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo((r - (isMajor ? 12 : 6)) * Math.sin(angle), -(r - (isMajor ? 12 : 6)) * Math.cos(angle));
        ctx.lineTo(r * Math.sin(angle), -r * Math.cos(angle));
        ctx.stroke();
    }

    // Punti Cardinali ad alto contrasto
    const pts = [
        { label: 'N', angle: 0, color: '#ef4444' }, // Rosso
        { label: 'E', angle: 90, color: '#e2e8f0' }, // Bianco/Grigio chiaro
        { label: 'S', angle: 180, color: '#e2e8f0' },
        { label: 'O', angle: 270, color: '#e2e8f0' }
    ];
    pts.forEach(p => {
        const angleRad = p.angle * Math.PI / 180;
        ctx.fillStyle = p.color;
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, (r - 20) * Math.sin(angleRad), -(r - 20) * Math.cos(angleRad));
    });

    // Linea indicante il Nord Celeste sul quadrante rotante
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r + 32);
    ctx.stroke();

    // Freccia sulla punta del Nord rotante
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -r + 16);
    ctx.lineTo(-6, -r + 30);
    ctx.lineTo(6, -r + 30);
    ctx.closePath();
    ctx.fill();

    // --- DISEGNO DIREZIONE SOLE E OMBRA GNOMONE ---
    if (state.sun.calculated) {
        const sunRad = state.sun.azimuth * Math.PI / 180;

        // Linea tratteggiata arancio verso il sole
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * Math.sin(sunRad), -r * Math.cos(sunRad));
        ctx.stroke();
        ctx.setLineDash([]); // Resetta lo stile linea continua

        if (state.sun.altitude > 0) {
            // L'ombra si allunga esattamente all'azimut opposto al Sole (+180 gradi)
            const shadowAzimuth = (state.sun.azimuth + 180) % 360;
            const shadowRad = shadowAzimuth * Math.PI / 180;

            // Calcolo della lunghezza geometrica fittizia dell'ombra per il display
            const virtualGnomon = 32;
            let len = virtualGnomon / Math.tan(state.sun.altitude * Math.PI / 180);
            if (len > r * 0.9) len = r * 0.9;
            if (len < 5) len = 5;

            const endX = len * Math.sin(shadowRad);
            const endY = -len * Math.cos(shadowRad);

            // Ombra sfumata (Giallo Sole neon per rendersi perfettamente visibile all'esterno)
            const shadowGrad = ctx.createRadialGradient(0, 0, 1, endX, endY, len * 0.4);
            shadowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.9)'); // Ambra acceso
            shadowGrad.addColorStop(0.7, 'rgba(251, 191, 36, 0.4)');
            shadowGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');

            ctx.strokeStyle = shadowGrad;
            ctx.lineWidth = 14;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Linea centrale di mira nitida (Giallo limone neon)
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Testo dell'ombra
            ctx.save();
            ctx.translate(endX / 2, endY / 2);
            let textAngle = shadowRad - Math.PI / 2;
            // Impedisce la scrittura del testo capovolto
            if (shadowAzimuth > 90 && shadowAzimuth < 270) textAngle += Math.PI;
            ctx.rotate(textAngle);
            ctx.fillStyle = '#fbbf24';
            ctx.font = '900 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('OMBRA PREVISTA', 0, -8);
            ctx.restore();
        } else {
            // Notte
            ctx.fillStyle = '#64748b';
            ctx.font = 'italic 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sole tramontato', 0, r * 0.4);
        }
    }

    ctx.restore(); // Ripristina lo stato dal disegno ruotato della bussola

    // --- 2. DISEGNO LIVELLA A BOLLA 3D FISSA AL CENTRO (NON RUOTA!) ---
    // Camera in vetro circolare al centro
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3.5;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // Sfondo semitrasparente per vedere l'ombra sotto
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Mirino di calibrazione (Cerchio di planarità)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)'; // Cyan soft
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.stroke();

    // Linee a croce del mirino
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy); ctx.lineTo(cx + 32, cy);
    ctx.moveTo(cx, cy - 32); ctx.lineTo(cx, cy + 32);
    ctx.stroke();

    // FISICA DELLA BOLLA D'ARIA
    const maxTiltValue = 10;
    let clampedX = Math.max(-maxTiltValue, Math.min(maxTiltValue, state.smoothTiltX));
    let clampedY = Math.max(-maxTiltValue, Math.min(maxTiltValue, state.smoothTiltY));

    // Rapporto spostamento in pixel (massimo 24px di corsa)
    const maxShiftPixels = 24;
    const bubbleX = cx + (clampedX / maxTiltValue) * maxShiftPixels;
    const bubbleY = cy - (clampedY / maxTiltValue) * maxShiftPixels;

    // Colore dinamico della bolla
    const totalTiltAngle = Math.sqrt(state.tiltX * state.tiltX + state.tiltY * state.tiltY);
    let bubbleGradient = ctx.createRadialGradient(bubbleX - 3, bubbleY - 3, 1, bubbleX, bubbleY, 8);

    if (totalTiltAngle < 1.3) {
        // In piano (Perfetto)
        bubbleGradient.addColorStop(0, '#4ade80'); // Verde neon
        bubbleGradient.addColorStop(1, '#16a34a');
    } else if (totalTiltAngle < 4.5) {
        // Quasi livellato
        bubbleGradient.addColorStop(0, '#fbfb24'); // Giallo
        bubbleGradient.addColorStop(1, '#d97706');
    } else {
        // Molto inclinato
        bubbleGradient.addColorStop(0, '#f87171'); // Rosso rubino
        bubbleGradient.addColorStop(1, '#dc2626');
    }

    // Disegna la bolla
    ctx.fillStyle = bubbleGradient;
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, 8, 0, 2 * Math.PI);
    ctx.fill();

    // Riflesso 3D bianco
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(bubbleX - 3, bubbleY - 3, 2.5, 0, 2 * Math.PI);
    ctx.fill();

    // --- 3. DISEGNO PUNTO CENTRALE GNOMONE FISSO ---
    ctx.strokeStyle = '#22d3ee'; // Cyan neon
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(cx, cy, 1, 0, 2 * Math.PI);
    ctx.fill();
}

// --- GESTIONE DEI SENSORI FISICI DEL TELEFONO ---
function handleOrientation(event) {
    state.hasHardwareSensors = true;

    // Lettura inclinometro per la livella (Beta e Gamma)
    state.tiltX = event.gamma || 0; // Inclinazione sinistra/destra
    state.tiltY = event.beta || 0;  // Inclinazione avanti/dietro

    // Lettura bussola magnetica passiva (per la sola freccia blu magnetica)
    if (event.webkitCompassHeading !== undefined) {
        state.magneticHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        state.magneticHeading = (360 - event.alpha) % 360;
    }

    // Aggiorna testi digitali inclinazione
    txtTiltX.textContent = `${state.tiltX.toFixed(1)}°`;
    txtTiltY.textContent = `${state.tiltY.toFixed(1)}°`;

    // Aggiornamento diagnostica sensori per la sola livella a bolla
    diagSensorsIcon.textContent = "🟢";
    diagSensorsVal.textContent = "LIVELLA ATTIVA";
    diagSensorsVal.className = "text-right font-bold text-emerald-400";

    helpAlert.classList.add('hidden');
    statusBadge.textContent = "Livella Online";
    statusBadge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";

    updateLevelBubble();
    draw();
}

// Richiesta permessi ed attivazione GPS/Sensori
async function sbloccaSensori() {
    btnSensors.textContent = "ATTIVAZIONE IN CORSO...";
    rilevaGPS();

    // Richiesta accelerometro/giroscopio per livella e bussola
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                connettiSensori();
                btnSensors.style.display = 'none';
            } else {
                diagSensorsIcon.textContent = "🔴";
                diagSensorsVal.textContent = "RIFIUTATO";
                diagSensorsVal.className = "text-right font-bold text-rose-500";
                btnSensors.textContent = "PERMESSO NEGATO - RIPROVA";
            }
        } catch (err) {
            console.error(err);
            btnSensors.textContent = "ERRORE SENSORI";
        }
    } else {
        // Android o Desktop (connessione diretta)
        connettiSensori();
        btnSensors.style.display = 'none';
    }
}

// Rilevamento GPS autonomo
function rilevaGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                
                // Aggiorna visivamente i due campi di input sul display
                inputLat.value = state.lat.toFixed(5);
                inputLon.value = state.lon.toFixed(5);
                lblPos.textContent = "GPS Attivo";
                
                calcolaPosizioneSole();
                draw();
            },
            (err) => {
                console.warn("GPS negato o non raggiungibile. Rimangono le coordinate manuali.");
                alert("Impossibile accedere al GPS. Controlla i permessi o inserisci le coordinate manualmente.");
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    } else {
        alert("Geolocalizzazione non supportata dal tuo browser.");
    }
}

function connettiSensori() {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
}

// --- SISTEMA DI TRASCINAMENTO MANUALE DELL'OMBRA (Gesti Drag) ---
function getAngleFromCenter(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
}

function dragStart(clientX, clientY) {
    state.isDragging = true;
    state.dragStartAngle = getAngleFromCenter(clientX, clientY);
    state.dragStartHeading = state.manualHeading;
}

// Rotazione fluida tramite gesture - INVERTITA per assecondare il trascinamento del dito!
function dragMove(clientX, clientY) {
    if (!state.isDragging) return;
    const curAngle = getAngleFromCenter(clientX, clientY);
    const delta = curAngle - state.dragStartAngle;
    // Invertito da '+ delta' a '- delta' per rendere la rotazione naturale
    state.manualHeading = (state.dragStartHeading - delta + 360) % 360;
    draw();
}

function dragEnd() {
    state.isDragging = false;
}

// Registrazione eventi Mouse
canvas.addEventListener('mousedown', (e) => dragStart(e.clientX, e.clientY));
window.addEventListener('mousemove', (e) => dragMove(e.clientX, e.clientY));
window.addEventListener('mouseup', dragEnd);

// Registrazione eventi Touch
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) dragStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) dragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
canvas.addEventListener('touchend', dragEnd);

// --- GESTIONE CAMPI DI INPUT MANUALE COORDINATE ---
function gestisciInputCoordinate() {
    const parsedLat = parseFloat(inputLat.value);
    const parsedLon = parseFloat(inputLon.value);

    if (!isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90) {
        state.lat = parsedLat;
    }
    if (!isNaN(parsedLon) && parsedLon >= -180 && parsedLon <= 180) {
        state.lon = parsedLon;
    }

    if (Math.abs(state.lat - 45.7272) < 0.01 && Math.abs(state.lon - 12.4632) < 0.01) {
        lblPos.textContent = "Ponte di Piave (Manuale)";
    } else {
        lblPos.textContent = "Coordinata Manuale";
    }

    calcolaPosizioneSole();
    draw();
}

inputLat.addEventListener('input', gestisciInputCoordinate);
inputLon.addEventListener('input', gestisciInputCoordinate);
btnGpsTrigger.addEventListener('click', rilevaGPS);
btnSensors.addEventListener('click', sbloccaSensori);

// --- LOOP PRINCIPALE ED EVENTI DI AVVIO ---
window.addEventListener('resize', resizeCanvas);

function tick() {
    const now = new Date();
    timeDisplay.textContent = now.toLocaleTimeString('it-IT');
    calcolaPosizioneSole();
    
    // Se i sensori fisici non sono disponibili, simuliamo una piccolissima oscillazione della bolla per dimostrazione
    if (!state.hasHardwareSensors) {
        const t = now.getTime() / 1500;
        state.tiltX = Math.sin(t) * 1.5;
        state.tiltY = Math.cos(t) * 1.5;
        txtTiltX.textContent = `${state.tiltX.toFixed(1)}°`;
        txtTiltY.textContent = `${state.tiltY.toFixed(1)}°`;
    }

    updateLevelBubble();
    draw();
}

// Prima inizializzazione
resizeCanvas();
eseguiDiagnostica();
setInterval(tick, 1000);
tick();

// Autostart sensori per sistemi Android/Desktop (dove non è richiesto clic)
if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    connettiSensori();
    setTimeout(() => {
        if (state.tiltX !== 0) {
            btnSensors.style.display = 'none';
        }
    }, 600);
}

// --- REGISTRAZIONE SERVICE WORKER PER PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrato con successo:', reg.scope))
            .catch(err => console.log('Errore registrazione Service Worker:', err));
    });
}
