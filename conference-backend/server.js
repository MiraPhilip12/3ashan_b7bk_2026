const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();

// CORS configuration
app.use(cors({
    origin: ['https://3ashan-b7bk-2026.vercel.app', 'http://localhost:5500', 'http://127.0.0.1:5500', '*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// Supabase configuration
const supabaseUrl = 'https://tizzdnyebnnagzvtzhhx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpenpkbnllYm5uYWd6dnR6aGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTczNzEsImV4cCI6MjA5MzA3MzM3MX0.KwY9oq3YnqN2SvamHBRDgfgKPUKaSZ3odbqr50gb2VU';
const supabase = createClient(supabaseUrl, supabaseKey);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ============ TEST ENDPOINTS ============
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working!' });
});

app.get('/api/debug-db', async (req, res) => {
    try {
        // Get reservation count
        const { count: reservationCount, error: rErr } = await supabase
            .from('reservations')
            .select('*', { count: 'exact', head: true });
        
        // Get participant count
        const { count: participantCount, error: pErr } = await supabase
            .from('participants')
            .select('*', { count: 'exact', head: true });
        
        // Get sample reservations
        const { data: sampleReservations, error: sErr } = await supabase
            .from('reservations')
            .select('id, phone_number, total_price, status, created_at')
            .order('id', { ascending: false })
            .limit(3);
        
        res.json({
            success: true,
            message: 'Database connected',
            stats: {
                reservations: reservationCount || 0,
                participants: participantCount || 0
            },
            recent_reservations: sampleReservations || [],
            errors: { reservations: rErr, participants: pErr, sample: sErr }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============ GROUPS ENDPOINT ============
app.get('/api/groups', async (req, res) => {
    try {
        const { data, error } = await supabase.from('group_capacity').select('*');
        if (error) throw error;
        
        const groupsWithAvailability = data.map(group => ({
            ...group,
            seats_available: group.max_capacity - group.current_count,
            is_full: (group.max_capacity - group.current_count) <= 0
        }));
        res.json(groupsWithAvailability);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ RESERVATIONS ENDPOINT ============
app.post('/api/reservations', upload.array('national_id_images', 20), async (req, res) => {
    try {
        console.log('=== NEW SUBMISSION ===');
        
        const formData = JSON.parse(req.body.data);
        const { phone_number, total_price, payment_platform, participants } = formData;
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        const paymentBase64 = req.files[0].buffer.toString('base64');
        const paymentMimeType = req.files[0].mimetype;
        const paymentFullBase64 = `data:${paymentMimeType};base64,${paymentBase64}`;
        
        // Create reservation
        const { data: reservation, error: reservationError } = await supabase
            .from('reservations')
            .insert({ 
                phone_number, 
                total_price, 
                payment_platform, 
                payment_screenshot_base64: paymentFullBase64,
                status: 'pending' 
            })
            .select()
            .single();
        
        if (reservationError) {
            console.error('Reservation error:', reservationError);
            return res.status(500).json({ error: reservationError.message });
        }
        
        console.log('Reservation created:', reservation.id);
        
        // Process each participant
        for (let i = 0; i < participants.length; i++) {
            const p = participants[i];
            const idFile = req.files[i + 1];
            
            let nationalIdBase64 = null;
            if (idFile) {
                const idBase64 = idFile.buffer.toString('base64');
                nationalIdBase64 = `data:${idFile.mimetype};base64,${idBase64}`;
            }
            
            const { error: participantError } = await supabase
                .from('participants')
                .insert({
                    reservation_id: reservation.id,
                    national_id: p.national_id,
                    national_id_image_base64: nationalIdBase64,
                    name: p.name,
                    age: parseInt(p.age),
                    days: p.days,
                    color_group: p.color_group,
                    price: parseFloat(p.price)
                });
            
            if (participantError) {
                console.error('Participant insert error:', participantError);
            }
        }
        
        console.log('=== SUBMISSION COMPLETE ===');
        res.json({ success: true, message: 'Reservation submitted!', reservation_id: reservation.id });
        
    } catch (error) {
        console.error('Fatal error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ADMIN ENDPOINTS ============
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    console.log('Login attempt');
    
    const { data, error } = await supabase
        .from('admin_settings')
        .select('admin_password')
        .single();
    
    if (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: error.message });
    }
    
    if (password === data.admin_password) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Get all reservations - OPTIMIZED (no timeout)
app.get('/api/admin/reservations', async (req, res) => {
    try {
        console.log('Fetching reservations...');
        
        // Set a longer timeout for this specific request
        req.setTimeout(30000); // 30 seconds
        
        // Fetch all reservations
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('DB Error:', error);
            return res.status(500).json({ error: error.message });
        }
        
        if (!reservations || reservations.length === 0) {
            return res.json([]);
        }
        
        // Get ALL participants in ONE query (not a loop)
        const reservationIds = reservations.map(r => r.id);
        const { data: allParticipants, error: pErr } = await supabase
            .from('participants')
            .select('*')
            .in('reservation_id', reservationIds);
        
        if (pErr) {
            console.error('Participants error:', pErr);
            // Return reservations without participants rather than failing
            return res.json(reservations.map(r => ({ ...r, participants: [] })));
        }
        
        // Group participants by reservation_id
        const participantsByReservation = {};
        for (const p of allParticipants || []) {
            if (!participantsByReservation[p.reservation_id]) {
                participantsByReservation[p.reservation_id] = [];
            }
            participantsByReservation[p.reservation_id].push(p);
        }
        
        // Combine reservations with their participants
        const results = reservations.map(resv => ({
            ...resv,
            participants: participantsByReservation[resv.id] || []
        }));
        
        console.log(`✅ Found ${results.length} reservations`);
        res.json(results);
        
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/approve/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('reservations')
        .update({ status: 'approved' })
        .eq('id', id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.post('/api/admin/reject/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('reservations')
        .update({ status: 'rejected' })
        .eq('id', id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.get('/api/admin/export-excel', async (req, res) => {
    const { data: reservations, error } = await supabase
        .from('reservations')
        .select('*, participants(*)')
        .eq('status', 'approved');
    
    if (error) return res.status(500).json({ error: error.message });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Approved Reservations');
    
    worksheet.columns = [
        { header: 'Reservation ID', key: 'id', width: 15 },
        { header: 'Phone Number', key: 'phone', width: 20 },
        { header: 'Total Price', key: 'price', width: 15 },
        { header: 'Payment Platform', key: 'platform', width: 20 },
        { header: 'Participant Name', key: 'name', width: 20 },
        { header: 'Age', key: 'age', width: 10 },
        { header: 'Days', key: 'days', width: 15 },
        { header: 'Color Group', key: 'color', width: 15 }
    ];
    
    reservations.forEach(reservation => {
        reservation.participants.forEach(participant => {
            worksheet.addRow({
                id: reservation.id,
                phone: reservation.phone_number,
                price: reservation.total_price,
                platform: reservation.payment_platform,
                name: participant.name,
                age: participant.age,
                days: participant.days,
                color: participant.color_group
            });
        });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=approved-reservations.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/api/admin/total-sales', async (req, res) => {
    const { data, error } = await supabase
        .from('reservations')
        .select('total_price')
        .eq('status', 'approved');
    
    if (error) return res.status(500).json({ error: error.message });
    const total = data.reduce((sum, r) => sum + parseFloat(r.total_price), 0);
    res.json({ total_sales: total });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));