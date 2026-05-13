const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '50mb' }));

// Supabase configuration - PUT YOUR ACTUAL VALUES HERE
const supabaseUrl = 'https://tizzdnyebnnagzvtzhhx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpenpkbnllYm5uYWd6dnR6aGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTczNzEsImV4cCI6MjA5MzA3MzM3MX0.KwY9oq3YnqN2SvamHBRDgfgKPUKaSZ3odbqr50gb2VU';
const supabase = createClient(supabaseUrl, supabaseKey);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working!' });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
    try {
        // Try to query admin_settings
        const { data, error } = await supabase
            .from('admin_settings')
            .select('*');
        
        if (error) {
            return res.json({ error: error.message, details: error });
        }
        
        res.json({ success: true, data: data });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Get groups
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

// ADMIN LOGIN - FIXED with better error handling
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    console.log('Login attempt with password:', password);
    
    try {
        // Use select('*') instead of single() to debug
        const { data, error } = await supabase
            .from('admin_settings')
            .select('*');
        
        console.log('Query result:', { data, error });
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ error: error.message });
        }
        
        if (!data || data.length === 0) {
            console.error('No admin settings found');
            return res.status(500).json({ error: 'No admin settings in database' });
        }
        
        const adminPassword = data[0].admin_password;
        console.log('Password from DB:', adminPassword);
        console.log('Comparison:', password === adminPassword);
        
        if (password === adminPassword) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Submit reservation
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
        
                // Create reservation - using base64 column only
        const { data: reservation, error: reservationError } = await supabase
            .from('reservations')
            .insert({ 
                phone_number, 
                total_price, 
                payment_platform, 
                payment_screenshot_base64: paymentFullBase64,
                payment_screenshot: null,  // Set to null since we use base64
                status: 'pending' 
            })
            .select()
            .single();
        
        if (reservationError) {
            console.error('Reservation error:', reservationError);
            return res.status(500).json({ error: reservationError.message });
        }
        
        console.log('Reservation created:', reservation.id);
        
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
            
            await supabase.rpc('increment_group_count', { group_name: p.color_group });
        }
        
        console.log('=== SUBMISSION COMPLETE ===');
        res.json({ success: true, message: 'Reservation submitted!', reservation_id: reservation.id });
        
    } catch (error) {
        console.error('Fatal error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all reservations
app.get('/api/admin/reservations', async (req, res) => {
    try {
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select(`
                id,
                phone_number,
                total_price,
                payment_platform,
                status,
                created_at,
                participants (
                    id,
                    name,
                    age,
                    days,
                    color_group,
                    price
                )
            `) // Notice: We EXCLUDED payment_screenshot_base64 and national_id_image_base64
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(reservations || []);
    } catch (err) {
        console.error('Fetch Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// Get a specific ID card image
app.get('/api/admin/participant-image/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('participants')
        .select('national_id_image_base64')
        .eq('id', req.params.id)
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ image: data.national_id_image_base64 });
});

// Get a specific payment screenshot
app.get('/api/admin/payment-image/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('reservations')
        .select('payment_screenshot_base64')
        .eq('id', req.params.id)
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ image: data.payment_screenshot_base64 });
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
    
    // Get participants to return their seats
    const { data: participants, error: fetchError } = await supabase
        .from('participants')
        .select('color_group')
        .eq('reservation_id', id);
    
    if (!fetchError && participants) {
        // Return seats for each participant's group
        for (const p of participants) {
            await supabase.rpc('decrement_group_count', { group_name: p.color_group });
        }
    }
    
    // Update status to rejected
    const { error } = await supabase
        .from('reservations')
        .update({ status: 'rejected' })
        .eq('id', id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Export Excel - SIMPLE VERSION (no timeout)
app.get('/api/admin/export-excel', async (req, res) => {
    try {
        console.log('📊 Generating Excel export...');
        
        // First, get all approved reservations
        const { data: reservations, error: rError } = await supabase
            .from('reservations')
            .select('id, phone_number, total_price, payment_platform, status, created_at')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });
        
        if (rError) {
            console.error('Error fetching reservations:', rError);
            return res.status(500).json({ error: rError.message });
        }
        
        if (!reservations || reservations.length === 0) {
            // Create empty workbook
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Approved Reservations');
            worksheet.addRow(['No approved reservations found']);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=approved-reservations.xlsx');
            await workbook.xlsx.write(res);
            res.end();
            return;
        }
        
        // Get participants for all reservations in ONE query
        const reservationIds = reservations.map(r => r.id);
        const { data: allParticipants, error: pError } = await supabase
            .from('participants')
            .select('*')
            .in('reservation_id', reservationIds);
        
        if (pError) {
            console.error('Error fetching participants:', pError);
        }
        
        // Group participants by reservation_id
        const participantsByReservation = {};
        for (const p of allParticipants || []) {
            if (!participantsByReservation[p.reservation_id]) {
                participantsByReservation[p.reservation_id] = [];
            }
            participantsByReservation[p.reservation_id].push(p);
        }
        
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Approved Reservations');
        
        // Add headers
        worksheet.columns = [
            { header: 'Reservation ID', key: 'id', width: 15 },
            { header: 'Phone Number', key: 'phone', width: 20 },
            { header: 'Total Price (EGP)', key: 'price', width: 15 },
            { header: 'Payment Platform', key: 'platform', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Participant Name', key: 'name', width: 25 },
            { header: 'Participant Age', key: 'age', width: 12 },
            { header: 'Participant Days', key: 'days', width: 15 },
            { header: 'Participant Color Group', key: 'color', width: 18 },
            { header: 'Participant Price', key: 'person_price', width: 15 }
        ];
        
        // Add rows
        for (const reservation of reservations) {
            const participants = participantsByReservation[reservation.id] || [];
            
            if (participants.length === 0) {
                // Reservation with no participants
                worksheet.addRow({
                    id: reservation.id,
                    phone: reservation.phone_number,
                    price: reservation.total_price,
                    platform: reservation.payment_platform,
                    status: reservation.status,
                    date: new Date(reservation.created_at).toLocaleDateString('en-EG'),
                    name: 'No participants',
                    age: '-',
                    days: '-',
                    color: '-',
                    person_price: '-'
                });
            } else {
                // One row per participant
                for (const participant of participants) {
                    worksheet.addRow({
                        id: reservation.id,
                        phone: reservation.phone_number,
                        price: reservation.total_price,
                        platform: reservation.payment_platform,
                        status: reservation.status,
                        date: new Date(reservation.created_at).toLocaleDateString('en-EG'),
                        name: participant.name || 'N/A',
                        age: participant.age || '-',
                        days: participant.days || '-',
                        color: participant.color_group || '-',
                        person_price: participant.price || '-'
                    });
                }
            }
        }
        
        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667EEA' }
        };
        
        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=approved-reservations.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Excel exported with ${reservations.length} reservations`);
        
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: err.message });
    }
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

// Direct test endpoint
app.get('/api/direct-test', async (req, res) => {
    try {
        // Try with explicit schema
        const { data, error } = await supabase
            .schema('public')
            .from('admin_settings')
            .select('*');
        
        res.json({ 
            error: error, 
            data: data,
            message: 'Check console for details'
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});


const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));