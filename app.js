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
    dragStartHeading: 0,
    
    // Parametri Mappa geografica sotto la bussola
    mapActive: false,
    mapZoom: 15,
    mapType: 'satellite',
    map: null,
    observerMarker: null,
    mapLayers: {},
    lockRotation: false,
    
    // Parametri Azimut Personalizzato
    personalAzActive: false,
    personalAzValue: 180
};

const canvas = document.getElementById('dialCanvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');
const utcDisplay = document.getElementById('utc-display');
const tzDisplay = document.getElementById('tz-display');

// Elementi DOM di stato
const lblAzimut = document.getElementById('lbl-azimut');
const lblAltezza = document.getElementById('lbl-altezza');
const lblPos = document.getElementById('lbl-pos');
const txtTiltX = document.getElementById('txt-tilt-x');
const txtTiltY = document.getElementById('txt-tilt-y');

// Bottoni e controlli per coordinate ed overlay
const btnSensors = document.getElementById('btn-sensors');
const btnGpsTrigger = document.getElementById('btn-gps-trigger');
const inputLat = document.getElementById('input-lat');
const inputLon = document.getElementById('input-lon');
const helpAlert = document.getElementById('help-alert');
const statusBadge = document.getElementById('status-badge');

// Pulsanti e modale diagnostica
const btnToggleDiag = document.getElementById('btn-toggle-diag');
const btnCloseDiag = document.getElementById('btn-close-diag');
const btnCloseDiagBottom = document.getElementById('btn-close-diag-bottom');
const diagModal = document.getElementById('diag-modal');

// Elementi diagnostica (modale)
const diagHttpsIcon = document.getElementById('diag-https-icon');
const diagHttpsVal = document.getElementById('diag-https-val');
const diagSensorsIcon = document.getElementById('diag-sensors-icon');
const diagSensorsVal = document.getElementById('diag-sensors-val');
const diagMagIcon = document.getElementById('diag-mag-icon');
const diagMagVal = document.getElementById('diag-mag-val');

// Elementi DOM Mappa e Azimut Personalizzato
const dialMap = document.getElementById('dialMap');
const checkMapActive = document.getElementById('check-map-active');
const mapControls = document.getElementById('map-controls');
const selectMapType = document.getElementById('select-map-type');
const sliderMapZoom = document.getElementById('slider-map-zoom');
const lblMapZoom = document.getElementById('lbl-map-zoom');
const checkLockRotation = document.getElementById('check-lock-rotation');
const checkAzimuthActive = document.getElementById('check-azimuth-active');
const azimuthValContainer = document.getElementById('azimuth-val-container');
const inputAzimuthValue = document.getElementById('input-azimuth-value');
const azimuthSliderContainer = document.getElementById('azimuth-slider-container');
const sliderAzimuthValue = document.getElementById('slider-azimuth-value');

// --- RIDIMENSIONAMENTO E DENSITY PIXELS DEL CANVAS ---
function resizeCanvas() {
    try {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    } catch (e) {
        console.error("Errore ridimensionamento canvas:", e);
    }
}

// --- SISTEMA DIAGNOSTICO ---
function eseguiDiagnostica() {
    try {
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
    } catch (e) {
        console.error("Errore diagnostica:", e);
    }
}

// --- CONTROLLO MODALE DIAGNOSTICA ---
function apriModale() {
    diagModal.classList.remove('hidden');
}

function chiudiModale() {
    diagModal.classList.add('hidden');
}

btnToggleDiag.addEventListener('click', apriModale);
btnCloseDiag.addEventListener('click', chiudiModale);
btnCloseDiagBottom.addEventListener('click', chiudiModale);

// --- DETERMINA FUSO ORARIO E ORA LEGALE ---
function aggiornaInformazioniFuso(now) {
    try {
        const tJan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
        const tJul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
        const isDST = now.getTimezoneOffset() < Math.max(tJan, tJul);
        
        const offsetMinuti = -now.getTimezoneOffset();
        const offsetOre = offsetMinuti / 60;
        const sign = offsetOre >= 0 ? "+" : "";
        
        let fusoNome = isDST ? "CEST (Ora Legale)" : "CET (Ora Solare)";
        tzDisplay.textContent = `${fusoNome} [UTC${sign}${offsetOre}]`;
    } catch (e) {
        tzDisplay.textContent = "Fuso: Rilevamento...";
    }
}

// --- ALGORITMO CALCOLO SOLE IN TEMPO REALE ---
function calcolaPosizioneSole() {
    try {
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

        // Coordinate equatoriali solari
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
    } catch (e) {
        console.error("Errore calcolo Sole:", e);
    }
}

// --- FUNZIONE DI AGGIORNAMENTO BOLLA LIVELLA ---
function updateLevelBubble() {
    const currentTiltX = Number(state.tiltX) || 0;
    const currentTiltY = Number(state.tiltY) || 0;
    
    if (isNaN(state.smoothTiltX)) state.smoothTiltX = 0;
    if (isNaN(state.smoothTiltY)) state.smoothTiltY = 0;

    // A 60 FPS usiamo un damping leggermente inferiore (0.12) per renderla meravigliosamente fluida
    const damping = 0.12;
    state.smoothTiltX += (currentTiltX - state.smoothTiltX) * damping;
    state.smoothTiltY += (currentTiltY - state.smoothTiltY) * damping;
}

// --- RENDERING CANVAS ---
function draw() {
    try {
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        if (w <= 0 || h <= 0) return;
        
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.44;

        ctx.clearRect(0, 0, w, h);

        const curHeading = Number(state.manualHeading) || 0;

        // --- DISEGNO DELLA LINEA ROSSA DEL NORD ESTESA ALL'INTERO SCHERMO ---
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
        ctx.restore();

        // (Il nord magnetico è stato spostato sotto per non essere coperto dal quadrante)

        // --- 1. DISEGNO DEL QUADRANTE ROTANTE DELLA BUSSOLA ---
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-curHeading * Math.PI / 180);

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.fillStyle = state.mapActive ? 'rgba(15, 23, 42, 0.45)' : '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        [0.35, 0.65, 0.85].forEach(scale => {
            ctx.beginPath();
            ctx.arc(0, 0, r * scale, 0, 2 * Math.PI);
            ctx.stroke();
        });

        // Tacche azimutali e gradi ogni 30°
        for (let deg = 0; deg < 360; deg += 10) {
            const angle = deg * Math.PI / 180;
            const isMajor = deg % 30 === 0;
            ctx.strokeStyle = isMajor ? '#64748b' : '#334155';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo((r - (isMajor ? 12 : 6)) * Math.sin(angle), -(r - (isMajor ? 12 : 6)) * Math.cos(angle));
            ctx.lineTo(r * Math.sin(angle), -r * Math.cos(angle));
            ctx.stroke();

            if (isMajor && deg !== 0 && deg !== 90 && deg !== 180 && deg !== 270) {
                ctx.save();
                ctx.translate((r - 20) * Math.sin(angle), -(r - 20) * Math.cos(angle));
                ctx.rotate(angle);
                ctx.fillStyle = '#94a3b8';
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${deg}°`, 0, 0);
                ctx.restore();
            }
        }

        // Punti Cardinali
        const pts = [
            { label: 'N', angle: 0, color: '#ef4444' },
            { label: 'E', angle: 90, color: '#e2e8f0' },
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

        // Nord Celeste (Frecce ed asse rosso ridimensionati per non sovrapporsi a 'N')
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r + 44);
        ctx.stroke();

        // Sud Celeste (Prolungamento asse rosso tratteggiato)
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, r - 44);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -r + 34);
        ctx.lineTo(-6, -r + 44);
        ctx.lineTo(6, -r + 44);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- DISEGNO DEL NORD MAGNETICO PASSIVO (LINEA TRATTEGGIATA BLU) ---
        if (state.magneticHeading !== null && !isNaN(state.magneticHeading)) {
            ctx.save();
            ctx.translate(cx, cy);
            const magAngleRad = -state.magneticHeading * Math.PI / 180;
            ctx.rotate(magAngleRad);

            ctx.strokeStyle = '#0ea5e9'; // Blu
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -r * 0.95);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Testo ruotato per essere leggibile
            ctx.translate(0, -r * 0.8);
            ctx.rotate(-Math.PI / 2); // Ruota il testo di 90 gradi per scriverlo lungo la linea
            ctx.fillStyle = '#0ea5e9';
            ctx.font = '900 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NORD MAGNETICO', 0, -6);

            ctx.restore();
        }

        // Disegno direzione Sole e Ombra
        if (state.sun.calculated) {
            const sunRad = state.sun.azimuth * Math.PI / 180;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-curHeading * Math.PI / 180);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(r * Math.sin(sunRad), -r * Math.cos(sunRad));
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Etichetta "DIREZIONE SOLE"
            ctx.save();
            ctx.translate((r * 0.75) * Math.sin(sunRad), -(r * 0.75) * Math.cos(sunRad));
            let sunTextAngle = sunRad - Math.PI / 2;
            if (state.sun.azimuth > 90 && state.sun.azimuth < 270) sunTextAngle += Math.PI;
            ctx.rotate(sunTextAngle);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
            ctx.font = '800 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SOLE', 0, -6);
            ctx.restore();

            if (state.sun.altitude > 0) {
                const shadowAzimuth = (state.sun.azimuth + 180) % 360;
                const shadowRad = shadowAzimuth * Math.PI / 180;

                let len = r * 0.85; // Fixed long length for easy alignment
                const endX = len * Math.sin(shadowRad);
                const endY = -len * Math.cos(shadowRad);

                const shadowGrad = ctx.createRadialGradient(0, 0, 1, endX, endY, len * 0.4);
                shadowGrad.addColorStop(0, 'rgba(57, 255, 20, 0.9)');
                shadowGrad.addColorStop(0.7, 'rgba(57, 255, 20, 0.4)');
                shadowGrad.addColorStop(1, 'rgba(57, 255, 20, 0)');

                ctx.strokeStyle = shadowGrad;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                ctx.strokeStyle = '#39ff14';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                ctx.save();
                ctx.translate(endX * 0.75, endY * 0.75);
                let textAngle = shadowRad - Math.PI / 2;
                if (shadowAzimuth > 90 && shadowAzimuth < 270) textAngle += Math.PI;
                ctx.rotate(textAngle);
                ctx.fillStyle = '#39ff14';
                ctx.font = '900 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('OMBRA', 0, -8);
                ctx.restore();
            } else {
                ctx.fillStyle = '#64748b';
                ctx.font = 'italic 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Sole tramontato', 0, r * 0.4);
            }
        }

        // --- DISEGNO AZIMUT PERSONALIZZATO (LINEA TRATTEGGIATA ROSA/MAGENTA NEON) ---
        if (state.personalAzActive) {
            const azVal = Number(state.personalAzValue) || 0;
            const azRad = azVal * Math.PI / 180;
            const endX = r * Math.sin(azRad);
            const endY = -r * Math.cos(azRad);

            ctx.save();
            ctx.strokeStyle = '#ec4899'; // Rosa neon / magenta
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Cerchietto terminale neon
            ctx.fillStyle = '#ec4899';
            ctx.beginPath();
            ctx.arc(endX * 0.95, endY * 0.95, 3.5, 0, 2 * Math.PI);
            ctx.fill();

            // Etichetta testuale
            ctx.translate(endX * 0.72, endY * 0.72);
            let azTextAngle = azRad - Math.PI / 2;
            if (azVal > 90 && azVal < 270) azTextAngle += Math.PI;
            ctx.rotate(azTextAngle);
            
            ctx.fillStyle = '#ec4899';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`AZIMUT: ${azVal}°`, 0, -6);
            ctx.restore();
        }

        ctx.restore();

        // --- 2. DISEGNO LIVELLA A BOLLA 3D FISSA ---
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3.5;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
        ctx.beginPath();
        ctx.moveTo(cx - 32, cy); ctx.lineTo(cx + 32, cy);
        ctx.moveTo(cx, cy - 32); ctx.lineTo(cx, cy + 32);
        ctx.stroke();

        // Fisica bolla
        const maxTiltValue = 10;
        let clampedX = Math.max(-maxTiltValue, Math.min(maxTiltValue, state.smoothTiltX));
        let clampedY = Math.max(-maxTiltValue, Math.min(maxTiltValue, state.smoothTiltY));

        const maxShiftPixels = 24;
        const bubbleX = cx - (clampedX / maxTiltValue) * maxShiftPixels;
        const bubbleY = cy - (clampedY / maxTiltValue) * maxShiftPixels;

        const totalTiltAngle = Math.sqrt(state.tiltX * state.tiltX + state.tiltY * state.tiltY);
        let bubbleGradient = ctx.createRadialGradient(bubbleX - 3, bubbleY - 3, 1, bubbleX, bubbleY, 8);

        if (totalTiltAngle < 1.3) {
            bubbleGradient.addColorStop(0, '#4ade80');
            bubbleGradient.addColorStop(1, '#16a34a');
        } else if (totalTiltAngle < 4.5) {
            bubbleGradient.addColorStop(0, '#fbfb24');
            bubbleGradient.addColorStop(1, '#d97706');
        } else {
            bubbleGradient.addColorStop(0, '#f87171');
            bubbleGradient.addColorStop(1, '#dc2626');
        }

        ctx.fillStyle = bubbleGradient;
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, 8, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(bubbleX - 3, bubbleY - 3, 2.5, 0, 2 * Math.PI);
        ctx.fill();

        // Gnomone centrale
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(cx, cy, 1, 0, 2 * Math.PI);
        ctx.fill();
    } catch (e) {
        console.error("Errore disegno Canvas:", e);
    }
}

// --- GESTIONE DEI SENSORI FISICI ---
function handleAbsoluteOrientation(event) {
    try {
        state.hasHardwareSensors = true;
        if (event.alpha !== null && event.alpha !== undefined) {
            state.magneticHeading = (360 - event.alpha) % 360;
            state.hasAbsoluteHeading = true;
            aggiornaStatoSensoriAttivi();
            if (diagMagVal) diagMagVal.textContent = state.magneticHeading.toFixed(1) + '°';
            if (diagMagIcon) diagMagIcon.textContent = '🟢';
        } else if (!state.hasAbsoluteHeading && diagMagVal && diagMagVal.textContent === 'N/A') {
            diagMagVal.textContent = 'Dati bussola assenti (alpha=null)';
        }
        // Legge l'inclinazione anche dall'evento assoluto per quei dispositivi (come alcuni Android) che non lanciano deviceorientation
        if (event.gamma !== null && event.beta !== null && event.gamma !== undefined && event.beta !== undefined) {
            state.tiltX = event.gamma;
            state.tiltY = event.beta;
            txtTiltX.textContent = `${state.tiltX.toFixed(1)}°`;
            txtTiltY.textContent = `${state.tiltY.toFixed(1)}°`;
        }
    } catch (e) {
        console.error("Errore orientamento assoluto:", e);
    }
}

function aggiornaStatoSensoriAttivi() {
    diagSensorsIcon.textContent = "🟢";
    diagSensorsVal.textContent = "LIVELLA & BUSSOLA ATTIVE";
    diagSensorsVal.className = "text-right font-bold text-emerald-400";

    helpAlert.classList.add('hidden');
    statusBadge.textContent = "Sensori Online";
    statusBadge.className = "px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
}

function handleOrientation(event) {
    try {
        state.hasHardwareSensors = true;

        state.tiltX = event.gamma !== null ? event.gamma : 0;
        state.tiltY = event.beta !== null ? event.beta : 0;

        // Rilevamento magnetico per la freccia blu (compatibile assoluto per iOS)
        if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
            state.magneticHeading = event.webkitCompassHeading;
            state.hasAbsoluteHeading = true;
        } else if (!state.hasAbsoluteHeading && event.alpha !== null && event.alpha !== undefined) {
            state.magneticHeading = (360 - event.alpha) % 360;
        }

        if (state.magneticHeading !== null) {
            if (diagMagVal) diagMagVal.textContent = state.magneticHeading.toFixed(1) + '°';
            if (diagMagIcon) diagMagIcon.textContent = '🟢';
        } else if (!state.hasAbsoluteHeading && diagMagVal && diagMagVal.textContent === 'N/A') {
            diagMagVal.textContent = 'Dati bussola assenti';
        }

        txtTiltX.textContent = `${state.tiltX.toFixed(1)}°`;
        txtTiltY.textContent = `${state.tiltY.toFixed(1)}°`;

        aggiornaStatoSensoriAttivi();
    } catch (e) {
        console.error("Errore orientamento:", e);
    }
}

// Richiesta permessi ed attivazione GPS/Sensori
async function sbloccaSensori() {
    try {
        btnSensors.textContent = "ATTIVAZIONE IN CORSO...";
        rilevaGPS();

        // 1. Richiesta su iOS (con pop-up nativo)
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
            // 2. Android (connessione diretta)
            connettiSensori();
            btnSensors.style.display = 'none';
        }
    } catch (e) {
        console.error("Errore sblocco sensori:", e);
    }
}

// Rilevamento GPS
function rilevaGPS() {
    try {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    state.lat = pos.coords.latitude;
                    state.lon = pos.coords.longitude;
                    
                    inputLat.value = state.lat.toFixed(5);
                    inputLon.value = state.lon.toFixed(5);
                    lblPos.textContent = "GPS Attivo";
                    
                    calcolaPosizioneSole();
                    aggiornaMappaSeAttiva();
                },
                (err) => {
                    console.warn("GPS non raggiungibile.");
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    } catch (e) {
        console.error("Errore geolocalizzazione:", e);
    }
}

// Ascolto simultaneo dell'evento standard e assoluto per catturare la bussola su Android
function connettiSensori() {
    try {
        window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    } catch (e) {
        console.error("Errore registrazione sensori:", e);
    }
}

// --- SISTEMA DI TRASCINAMENTO MANUALE ---
function getAngleFromCenter(clientX, clientY) {
    try {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
    } catch (e) {
        return 0;
    }
}

function dragStart(clientX, clientY) {
    state.isDragging = true;
    state.dragStartAngle = getAngleFromCenter(clientX, clientY);
    state.dragStartHeading = state.manualHeading;
}

function dragMove(clientX, clientY) {
    if (!state.isDragging) return;
    const curAngle = getAngleFromCenter(clientX, clientY);
    const delta = curAngle - state.dragStartAngle;
    state.manualHeading = (state.dragStartHeading - delta + 360) % 360;
}

function dragEnd() {
    state.isDragging = false;
}

canvas.addEventListener('mousedown', (e) => {
    dragStart(e.clientX, e.clientY);
    e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
    if (state.isDragging) {
        dragMove(e.clientX, e.clientY);
        e.preventDefault();
    }
});
window.addEventListener('mouseup', dragEnd);

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        dragStart(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        dragMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }
}, { passive: false });
canvas.addEventListener('touchend', dragEnd);

// --- GESTIONE CAMPI DI INPUT MANUALE COORDINATE ---
function gestisciInputCoordinate() {
    try {
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
        aggiornaMappaSeAttiva();
    } catch (e) {
        console.error("Errore input coordinate:", e);
    }
}

inputLat.addEventListener('input', gestisciInputCoordinate);
inputLon.addEventListener('input', gestisciInputCoordinate);
btnGpsTrigger.addEventListener('click', rilevaGPS);
btnSensors.addEventListener('click', sbloccaSensori);

// --- SISTEMA DI INIZIALIZZAZIONE E GESTIONE MAPPA LEAFLET ---
function initOrUpdateMap() {
    try {
        if (!state.mapActive) return;
        if (!dialMap) return;

        dialMap.classList.remove('hidden');

        // Se l'istanza della mappa esiste già, aggiorna la vista e il marker
        if (state.map) {
            state.map.setView([state.lat, state.lon], state.mapZoom);
            
            // Rimuove eventuali marker precedenti per evitare duplicati
            if (state.observerMarker) {
                state.map.removeLayer(state.observerMarker);
            }
            addObserverMarker();
            
            // Forza l'aggiornamento grafico
            setTimeout(() => {
                state.map.invalidateSize();
            }, 50);
            return;
        }

        // Inizializza l'istanza Leaflet
        state.map = L.map('dialMap', {
            center: [state.lat, state.lon],
            zoom: state.mapZoom,
            zoomControl: false,
            attributionControl: false,
            dragging: state.lockRotation,
            scrollWheelZoom: false,
            touchZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false
        });

        // Evento trascinamento per centratura fine
        state.map.on('drag', () => {
            if (!state.lockRotation) return;
            const center = state.map.getCenter();
            state.lat = center.lat;
            state.lon = center.lng;

            if (inputLat) inputLat.value = state.lat.toFixed(5);
            if (inputLon) inputLon.value = state.lon.toFixed(5);

            if (state.observerMarker) {
                state.observerMarker.setLatLng(center);
            }

            // Ricalcola istantaneamente sole e ombre con la nuova posizione
            calcolaPosizioneSole();
        });

        // Configura i Layer
        state.mapLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20
        });

        state.mapLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });

        // Applica il layer selezionato
        if (state.mapType === 'dark') {
            state.mapLayers.dark.addTo(state.map);
        } else {
            state.mapLayers.satellite.addTo(state.map);
        }

        // Posiziona il marker dell'osservatore al centro
        addObserverMarker();

        // Applica lo stato iniziale di blocco/traslazione
        updateLockRotationMode();

        // Forza rinfresco dimensioni
        setTimeout(() => {
            state.map.invalidateSize();
        }, 100);

    } catch (e) {
        console.error("Errore inizializzazione mappa Leaflet:", e);
    }
}

function addObserverMarker() {
    try {
        if (!state.map) return;
        const observerIcon = L.divIcon({
            className: 'observer-marker',
            html: `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: #0ea5e9; border: 2.5px solid #fff; box-shadow: 0 0 12px #0ea5e9, 0 0 4px rgba(255,255,255,0.8);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        state.observerMarker = L.marker([state.lat, state.lon], { icon: observerIcon }).addTo(state.map);
    } catch (e) {
        console.error("Errore posizionamento marker osservatore:", e);
    }
}

function aggiornaMappaSeAttiva() {
    if (state.mapActive) {
        initOrUpdateMap();
    }
}

function updateLockRotationMode() {
    if (!state.map) return;
    
    if (state.lockRotation) {
        // Abilita il dragging di Leaflet
        state.map.dragging.enable();
        
        // Passa gli eventi mouse attraverso il canvas alla mappa sottostante
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        }
        if (dialMap) {
            dialMap.style.pointerEvents = 'auto';
            dialMap.style.cursor = 'grab';
            dialMap.style.transform = 'rotate(0deg)';
        }
    } else {
        // Disabilita il dragging di Leaflet
        state.map.dragging.disable();
        
        // Ripristina gli eventi sul canvas per la rotazione della bussola
        if (canvas) {
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'grab';
        }
        if (dialMap) {
            dialMap.style.pointerEvents = 'none';
            dialMap.style.cursor = 'default';
            dialMap.style.transform = `rotate(${-state.manualHeading}deg)`;
        }
    }
}

// --- ASCOLTATORI EVENTI CONTROLLI MAPPA E AZIMUT ---
if (checkMapActive) {
    checkMapActive.addEventListener('change', (e) => {
        state.mapActive = e.target.checked;
        if (state.mapActive) {
            mapControls.classList.remove('hidden');
            dialMap.classList.remove('hidden');
            initOrUpdateMap();
        } else {
            mapControls.classList.add('hidden');
            dialMap.classList.add('hidden');
            if (state.map) {
                // Rimuoviamo la mappa e resettiamo l'istanza per risparmiare risorse
                state.map.remove();
                state.map = null;
                state.observerMarker = null;
            }
        }
    });
}

if (selectMapType) {
    selectMapType.addEventListener('change', (e) => {
        state.mapType = e.target.value;
        if (state.map) {
            if (state.map.hasLayer(state.mapLayers.dark)) state.map.removeLayer(state.mapLayers.dark);
            if (state.map.hasLayer(state.mapLayers.satellite)) state.map.removeLayer(state.mapLayers.satellite);

            if (state.mapType === 'dark') {
                state.mapLayers.dark.addTo(state.map);
            } else {
                state.mapLayers.satellite.addTo(state.map);
            }
        }
    });
}

if (sliderMapZoom) {
    sliderMapZoom.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.mapZoom = val;
        lblMapZoom.textContent = val;
        if (state.map) {
            state.map.setZoom(val);
        }
    });
}

if (checkLockRotation) {
    checkLockRotation.addEventListener('change', (e) => {
        state.lockRotation = e.target.checked;
        updateLockRotationMode();
    });
}

if (checkAzimuthActive) {
    checkAzimuthActive.addEventListener('change', (e) => {
        state.personalAzActive = e.target.checked;
        if (state.personalAzActive) {
            azimuthValContainer.classList.remove('hidden');
            azimuthValContainer.classList.add('flex');
            azimuthSliderContainer.classList.remove('hidden');
            azimuthSliderContainer.classList.add('flex');
        } else {
            azimuthValContainer.classList.add('hidden');
            azimuthValContainer.classList.remove('flex');
            azimuthSliderContainer.classList.add('hidden');
            azimuthSliderContainer.classList.remove('flex');
        }
    });
}

function aggiornaValoreAzimut(val) {
    let num = parseInt(val);
    if (isNaN(num)) num = 0;
    num = (num % 360 + 360) % 360; // range 0-359
    state.personalAzValue = num;
    
    if (inputAzimuthValue && inputAzimuthValue.value != num) {
        inputAzimuthValue.value = num;
    }
    if (sliderAzimuthValue && sliderAzimuthValue.value != num) {
        sliderAzimuthValue.value = num;
    }
}

if (sliderAzimuthValue) {
    sliderAzimuthValue.addEventListener('input', (e) => {
        aggiornaValoreAzimut(e.target.value);
    });
}

if (inputAzimuthValue) {
    inputAzimuthValue.addEventListener('input', (e) => {
        aggiornaValoreAzimut(e.target.value);
    });
}

// --- LOOP DEDICATO ALL'OROLOGIO E ALL'ASTRONOMIA (1 VOLTA AL SECONDO) ---
setInterval(() => {
    try {
        const now = new Date();
        
        // Aggiornamento display ora locale
        if (timeDisplay) timeDisplay.textContent = now.toLocaleTimeString('it-IT');
        
        // Aggiornamento display ora UTC
        if (utcDisplay) {
            const utcHours = String(now.getUTCHours()).padStart(2, '0');
            const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
            const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
            utcDisplay.textContent = `${utcHours}:${utcMinutes}:${utcSeconds}`;
        }
        
        aggiornaInformazioniFuso(now);
        calcolaPosizioneSole();
    } catch(e) {
        console.error("Errore loop orologio:", e);
    }
}, 1000);

// --- RENDERING LOOP GRAFICO AD ALTE PRESTAZIONI (60 FPS - REQUEST ANIMATION FRAME) ---
// Questo garantisce una fluidità pazzesca ed immediata della bolla e del drag!
function loopGrafico() {
    try {
        const now = new Date();
        
        // Simulatore se non ci sono sensori fisici attivi (Micro oscillazione fluida)
        if (!state.hasHardwareSensors) {
            const t = now.getTime() / 1500;
            state.tiltX = Math.sin(t) * 1.5;
            state.tiltY = Math.cos(t) * 1.5;
            if (txtTiltX) txtTiltX.textContent = `${state.tiltX.toFixed(1)}°`;
            if (txtTiltY) txtTiltY.textContent = `${state.tiltY.toFixed(1)}°`;
        }

        updateLevelBubble();
        draw();
        
        // Sincronizzazione della rotazione della mappa con il quadrante
        if (state.mapActive && dialMap) {
            if (state.lockRotation) {
                dialMap.style.transform = 'rotate(0deg)';
            } else {
                dialMap.style.transform = `rotate(${-state.manualHeading}deg)`;
            }
        }
    } catch (e) {
        console.error("Errore loop grafico:", e);
    }
    requestAnimationFrame(loopGrafico);
}

// Avvio del loop grafico e prima inizializzazione
try {
    resizeCanvas();
    eseguiDiagnostica();
    calcolaPosizioneSole();
    
    // Primo avvio orologio
    const initialDate = new Date();
    if (timeDisplay) timeDisplay.textContent = initialDate.toLocaleTimeString('it-IT');
    aggiornaInformazioniFuso(initialDate);
    
    // Start loop grafico immediato
    requestAnimationFrame(loopGrafico);
} catch (e) {
    console.error("Errore inizializzazione:", e);
}

// Autostart sensori per sistemi Android/Desktop (dove non è richiesto clic)
if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    try {
        connettiSensori();
        setTimeout(() => {
            if (state.tiltX !== 0) {
                btnSensors.style.display = 'none';
            }
        }, 600);
    } catch (e) {
        console.error("Errore autostart:", e);
    }
}

// --- REGISTRAZIONE SERVICE WORKER PER PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrato con successo:', reg.scope))
            .catch(err => console.log('Errore registrazione Service Worker:', err));
    });
}
