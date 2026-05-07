const BACKEND_URL = 'https://threeashan-b7bk-2026.onrender.com';
let isLoggedIn = false;

// Login function
async function login() {
    const password = document.getElementById('adminPassword').value;
    const loginError = document.getElementById('loginError');
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            isLoggedIn = true;
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('dashboardSection').classList.remove('hidden');
            loadReservations();
            loadTotalSales();
        } else {
            loginError.textContent = 'كلمة المرور غير صحيحة';
            loginError.classList.remove('hidden');
        }
    } catch (error) {
        loginError.textContent = 'خطأ في الاتصال بالخادم';
        loginError.classList.remove('hidden');
    }
}

// Load all reservations - FIXED
async function loadReservations() {
    try {
        console.log('Fetching reservations from:', `${BACKEND_URL}/api/admin/reservations`);
        
        const response = await fetch(`${BACKEND_URL}/api/admin/reservations`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received data type:', typeof data);
        console.log('Is array?', Array.isArray(data));
        console.log('Data:', data);
        
        // Handle both array and object responses
        let reservations = [];
        if (Array.isArray(data)) {
            reservations = data;
        } else if (data.data && Array.isArray(data.data)) {
            reservations = data.data;
        } else if (data.reservations && Array.isArray(data.reservations)) {
            reservations = data.reservations;
        } else {
            console.warn('Unexpected data format:', data);
            reservations = [];
        }
        
        displayReservations(reservations);
        
    } catch (error) {
        console.error('Error loading reservations:', error);
        document.getElementById('reservationsList').innerHTML = 
            '<p style="color: red;">خطأ في تحميل الطلبات: ' + error.message + '</p>';
    }
}

// Display reservations - FIXED
function displayReservations(reservations) {
    const container = document.getElementById('reservationsList');
    
    console.log('Displaying reservations:', reservations.length);
    
    if (!reservations || reservations.length === 0) {
        container.innerHTML = '<p>لا توجد طلبات حالياً</p>';
        return;
    }
    
    container.innerHTML = reservations.map(res => {
        // Handle participants safely
        const participants = res.participants || [];
        
        return `
        <div class="reservation-card">
            <div class="reservation-header">
                <span class="reservation-id">طلب #${res.id}</span>
                <span class="reservation-status status-${res.status || 'pending'}">${getStatusText(res.status)}</span>
            </div>
            
            <div class="reservation-info">
                <div class="info-item"><strong>رقم WhatsApp:</strong> ${res.phone_number || 'N/A'}</div>
                <div class="info-item"><strong>السعر الإجمالي:</strong> ${res.total_price || 0} ج.م</div>
                <div class="info-item"><strong>منصة الدفع:</strong> ${res.payment_platform || 'N/A'}</div>
                <div class="info-item"><strong>تاريخ التسجيل:</strong> ${res.created_at ? new Date(res.created_at).toLocaleDateString('ar-EG') : 'N/A'}</div>
                <div class="info-item"><strong>إيصال الدفع:</strong><br>
                    ${res.payment_screenshot_base64 ? 
                        `<img src="${res.payment_screenshot_base64}" class="payment-screenshot" onclick="showImage('${res.payment_screenshot_base64}')">` : 
                        'لا يوجد إيصال'}
                </div>
            </div>
            
            <div class="participants-table">
                <table>
                    <thead>
                        <tr><th>الاسم</th><th>صورة الهوية</th><th>العمر</th><th>الأيام</th><th>المجموعة</th><th>السعر</th></tr>
                    </thead>
                    <tbody>
                        ${participants.map(p => `
                            <tr>
                                <td>${p.name || 'N/A'}</td>
                                <td>${p.national_id_image_base64 ? 
                                    `<img src="${p.national_id_image_base64}" class="id-image" onclick="showImage('${p.national_id_image_base64}')">` : 
                                    'لا توجد'}</td>
                                <td>${p.age || 'N/A'}</td>
                                <td>${p.days || 'N/A'}</td>
                                <td style="background:${getGroupColor(p.color_group)}; color:white; padding:5px; border-radius:5px;">${p.color_group || 'N/A'}</td>
                                <td>${p.price || 0} ج.م</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            ${res.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="approve-btn" onclick="approveReservation(${res.id})">✅ قبول</button>
                    <button class="reject-btn" onclick="rejectReservation(${res.id})">❌ رفض</button>
                </div>
            ` : ''}
        </div>
    `}).join('');
}

function getStatusText(status) {
    switch(status) {
        case 'pending': return 'قيد المراجعة';
        case 'approved': return 'تم القبول';
        case 'rejected': return 'مرفوض';
        default: return status;
    }
}

function getGroupColor(groupName) {
    const colors = {
        'Red Group': '#FF0000',
        'Blue Group': '#0000FF',
        'Green Group': '#00FF00',
        'Yellow Group': '#FFFF00',
        'Purple Group': '#800080',
        'Orange Group': '#FFA500'
    };
    return colors[groupName] || '#999';
}

// Approve reservation
async function approveReservation(id) {
    if (!confirm('هل أنت متأكد من قبول هذا الطلب؟ سيتم إرسال رسالة تأكيد واتساب.')) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/approve/${id}`, {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            alert('تم قبول الطلب بنجاح');
            loadReservations();
            loadTotalSales();
        }
    } catch (error) {
        alert('خطأ: ' + error.message);
    }
}

// Reject reservation
async function rejectReservation(id) {
    if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/reject/${id}`, {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            alert('تم رفض الطلب');
            loadReservations();
        }
    } catch (error) {
        alert('خطأ: ' + error.message);
    }
}

// Load total sales
async function loadTotalSales() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/total-sales`);
        const data = await response.json();
        document.getElementById('totalSales').innerHTML = `${data.total_sales} ج.م`;
    } catch (error) {
        console.error('Error loading sales:', error);
    }
}

// Export Excel
async function exportExcel() {
    window.open(`${BACKEND_URL}/api/admin/export-excel`, '_blank');
}

// Show image modal
function showImage(url) {
    const modal = document.getElementById('imageModal') || createModal();
    const modalImg = document.getElementById('modalImage');
    modal.style.display = 'block';
    modalImg.src = url;
}

function createModal() {
    const modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <span class="close-modal">&times;</span>
        <img class="modal-content" id="modalImage">
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => {
        modal.style.display = 'none';
    };
    
    window.onclick = (event) => {
        if (event.target === modal) modal.style.display = 'none';
    };
    
    return modal;
}

// Logout
function logout() {
    isLoggedIn = false;
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('adminPassword').value = '';
}

// Event listeners
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('exportExcelBtn').addEventListener('click', exportExcel);

// Enter key for login
document.getElementById('adminPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});