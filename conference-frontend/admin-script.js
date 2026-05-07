const BACKEND_URL = 'https://threeashan-b7bk-2026.onrender.com';
let isLoggedIn = true;

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

// Load all reservations
async function loadReservations() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/reservations`);
        const reservations = await response.json();
        displayReservations(reservations);
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

// Display reservations - UPDATED to use base64 fields
function displayReservations(reservations) {
    const container = document.getElementById('reservationsList');
    
    if (reservations.length === 0) {
        container.innerHTML = '<p>لا توجد طلبات حالياً</p>';
        return;
    }
    
    container.innerHTML = reservations.map(res => `
        <div class="reservation-card">
            <div class="reservation-header">
                <span class="reservation-id">طلب #${res.id}</span>
                <span class="reservation-status status-${res.status}">${getStatusText(res.status)}</span>
            </div>
            
            <div class="reservation-info">
                <div class="info-item"><strong>رقم WhatsApp:</strong> ${res.phone_number}</div>
                <div class="info-item"><strong>السعر الإجمالي:</strong> ${res.total_price} ج.م</div>
                <div class="info-item"><strong>منصة الدفع:</strong> ${res.payment_platform}</div>
                <div class="info-item"><strong>تاريخ التسجيل:</strong> ${new Date(res.created_at).toLocaleDateString('ar-EG')}</div>
                <div class="info-item"><strong>إيصال الدفع:</strong><br><img src="${res.payment_screenshot_base64 || res.payment_screenshot}" class="payment-screenshot" onclick="showImage('${res.payment_screenshot_base64 || res.payment_screenshot}')"></div>
            </div>
            
            <div class="participants-table">
                <table>
                    <thead>
                        <tr><th>الاسم</th><th>صورة الهوية</th><th>العمر</th><th>الأيام</th><th>المجموعة</th><th>السعر</th></tr>
                    </thead>
                    <tbody>
                        ${res.participants.map(p => `
                            <tr>
                                <td>${p.name}</td>
                                <td>${p.national_id_image_base64 ? `<img src="${p.national_id_image_base64}" class="id-image" onclick="showImage('${p.national_id_image_base64}')">` : 'لا توجد'}</td>
                                <td>${p.age}</td>
                                <td>${p.days}</td>
                                <td style="background:${getGroupColor(p.color_group)}; color:white; padding:5px; border-radius:5px;">${p.color_group}</td>
                                <td>${p.price} ج.م</td>
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
    `).join('');
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