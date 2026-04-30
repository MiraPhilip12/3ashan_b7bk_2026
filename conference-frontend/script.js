let currentLanguage = 'ar';
let selectedDays = 'one';
let selectedOneDay = '29th May';
let groupsData = [];

// Prices (you can change these)
const PRICES = {
    oneDay: 350,
    twoDays: 700
};

// Backend URL (change this when you deploy)
const BACKEND_URL = 'http://localhost:5000';

// Load groups from backend
async function loadGroups() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/groups`);
        groupsData = await response.json();
        console.log('Groups loaded:', groupsData); // For debugging
        populateGroupOptions();
    } catch (error) {
        console.error('Error loading groups:', error);
        // Fallback groups if backend not running
        groupsData = [
            { color_name: 'Red Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false },
            { color_name: 'Blue Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false },
            { color_name: 'Green Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false },
            { color_name: 'Yellow Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false },
            { color_name: 'Purple Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false },
            { color_name: 'Orange Group', max_capacity: 10, current_count: 0, seats_available: 10, is_full: false }
        ];
        populateGroupOptions();
    }
}

function populateGroupOptions() {
    const groupSelects = document.querySelectorAll('.participant-group');
    groupSelects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">اختر المجموعة</option>'; // Add default option
        groupsData.forEach(group => {
            const option = document.createElement('option');
            option.value = group.color_name;
            const seatsText = group.is_full ? ' (مكتمل)' : ` (${group.seats_available} متاح)`;
            option.textContent = `${group.color_name}${seatsText}`;
            option.disabled = group.is_full;
            select.appendChild(option);
        });
        if (currentValue && [...select.options].some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    });
    updateSeatAvailability();
}

function updateSeatAvailability() {
    const cards = document.querySelectorAll('.participant-card');
    cards.forEach((card, index) => {
        const groupSelect = card.querySelector('.participant-group');
        const seatsDiv = card.querySelector('.group-seats');
        const selectedGroup = groupSelect.value;
        const group = groupsData.find(g => g.color_name === selectedGroup);
        if (group && selectedGroup) {
            if (group.is_full) {
                seatsDiv.innerHTML = '❌ مجموعة مكتملة';
                seatsDiv.className = 'group-seats full';
            } else {
                seatsDiv.innerHTML = `✅ ${group.seats_available} مقعد متاح`;
                seatsDiv.className = 'group-seats';
            }
        } else {
            seatsDiv.innerHTML = '';
        }
    });
    calculateTotalPrice();
}

function calculateTotalPrice() {
    const participantCount = document.querySelectorAll('.participant-card').length;
    let pricePerPerson = selectedDays === 'oneDay' ? PRICES.oneDay : PRICES.twoDays;
    const total = participantCount * pricePerPerson;
    const priceDisplay = document.getElementById('priceDisplay');
    const currency = currentLanguage === 'ar' ? 'ج.م' : 'EGP';
    priceDisplay.innerHTML = currentLanguage === 'ar' 
        ? `السعر الإجمالي: ${total} ${currency}`
        : `Total Price: ${total} ${currency}`;
}

// Add participant
function addParticipant() {
    const container = document.getElementById('participantsContainer');
    const newCard = document.createElement('div');
    newCard.className = 'participant-card';
    newCard.innerHTML = `
        <input type="text" placeholder="${currentLanguage === 'ar' ? 'الاسم الكامل' : 'Full Name'}" class="participant-name" required>
        <input type="file" accept="image/*" class="participant-id-image" required>
        <input type="number" placeholder="${currentLanguage === 'ar' ? 'العمر' : 'Age'}" class="participant-age" required>
        <select class="participant-group" required>
            <option value="">${currentLanguage === 'ar' ? 'اختر المجموعة' : 'Select Group'}</option>
        </select>
        <div class="group-seats"></div>
        <button type="button" class="remove-participant-btn" onclick="this.closest('.participant-card').remove(); populateGroupOptions(); calculateTotalPrice();">🗑️ ${currentLanguage === 'ar' ? 'حذف' : 'Remove'}</button>
    `;
    container.appendChild(newCard);
    populateGroupOptions();
}

// Submit reservation (NO manual National ID input - only image)
async function submitReservation(event) {
    event.preventDefault();
    
    const phoneNumber = document.getElementById('phoneNumber').value;
    const paymentPlatform = document.getElementById('paymentPlatform').value;
    const paymentScreenshot = document.getElementById('paymentScreenshot').files[0];
    
    console.log('Phone:', phoneNumber);
    console.log('Payment Platform:', paymentPlatform);
    console.log('Payment Screenshot:', paymentScreenshot);
    
    if (!phoneNumber || !paymentPlatform || !paymentScreenshot) {
        alert(currentLanguage === 'ar' ? 'يرجى ملء جميع البيانات' : 'Please fill all required fields');
        return;
    }
    
    const participants = [];
    const nationalIdImages = [paymentScreenshot]; // First file is payment screenshot
    
    const participantCards = document.querySelectorAll('.participant-card');
    
    if (participantCards.length === 0) {
        alert(currentLanguage === 'ar' ? 'يجب إضافة مشارك واحد على الأقل' : 'Add at least one participant');
        return;
    }
    
    for (let card of participantCards) {
        const name = card.querySelector('.participant-name').value;
        const idImage = card.querySelector('.participant-id-image').files[0];
        const age = card.querySelector('.participant-age').value;
        const colorGroup = card.querySelector('.participant-group').value;
        
        console.log('Participant:', { name, hasImage: !!idImage, age, colorGroup });
        
        if (!name || !idImage || !age || !colorGroup) {
            alert(currentLanguage === 'ar' ? 'يرجى ملء بيانات جميع المشاركين (الاسم، صورة الهوية، العمر، المجموعة)' : 'Please fill all participant data (name, ID image, age, group)');
            return;
        }
        
        participants.push({
            name: name,
            national_id: 'uploaded_' + Date.now() + '_' + Math.random(),
            age: age,
            color_group: colorGroup,
            days: selectedDays === 'oneDay' ? selectedOneDay : 'Both Days',
            price: selectedDays === 'oneDay' ? PRICES.oneDay : PRICES.twoDays
        });
        
        nationalIdImages.push(idImage);
    }
    
    const totalPrice = participants.length * (selectedDays === 'oneDay' ? PRICES.oneDay : PRICES.twoDays);
    
    console.log('Total price:', totalPrice);
    console.log('Number of files:', nationalIdImages.length);
    
    const formData = new FormData();
    formData.append('data', JSON.stringify({
        phone_number: phoneNumber,
        total_price: totalPrice,
        payment_platform: paymentPlatform,
        participants: participants
    }));
    
    for (let image of nationalIdImages) {
        formData.append('national_id_images', image);
    }
    
    try {
        console.log('Sending to:', `${BACKEND_URL}/api/reservations`);
        
        const response = await fetch(`${BACKEND_URL}/api/reservations`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Response status:', response.status);
        
        const result = await response.json();
        console.log('Result:', result);
        
        if (result.success) {
            document.getElementById('successMessage').innerHTML = currentLanguage === 'ar'
                ? '✅ تم إرسال طلبك بنجاح! سيتم إرسال تأكيد على WhatsApp بعد الموافقة.'
                : '✅ Your reservation has been submitted! You will receive WhatsApp confirmation upon approval.';
            document.getElementById('successMessage').classList.remove('hidden');
            document.getElementById('reservationForm').reset();
            // Clear participants except first
            const container = document.getElementById('participantsContainer');
            while (container.children.length > 1) {
                container.removeChild(container.lastChild);
            }
            // Reset first participant card
            const firstCard = container.children[0];
            if (firstCard) {
                firstCard.querySelector('.participant-name').value = '';
                firstCard.querySelector('.participant-id-image').value = '';
                firstCard.querySelector('.participant-age').value = '';
                firstCard.querySelector('.participant-group').value = '';
            }
            setTimeout(() => {
                document.getElementById('successMessage').classList.add('hidden');
            }, 5000);
        } else {
            alert('Error: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Submission error:', error);
        alert('Submission error: ' + error.message);
    }
}

// Language switching
function toggleLanguage() {
    currentLanguage = currentLanguage === 'ar' ? 'en' : 'ar';
    document.body.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    document.getElementById('langBtn').textContent = currentLanguage === 'ar' ? 'English' : 'العربية';
    document.getElementById('title').textContent = currentLanguage === 'ar' ? 'تسجيل المؤتمر' : 'Conference Registration';
    document.getElementById('dateTitle').textContent = currentLanguage === 'ar' ? 'اختر أيام الحضور' : 'Select Attendance Days';
    document.getElementById('oneDayBtn').textContent = currentLanguage === 'ar' ? 'يوم واحد (29 أو 30 مايو)' : 'One Day (29th or 30th May)';
    document.getElementById('twoDaysBtn').textContent = currentLanguage === 'ar' ? 'يومين (29 و 30 مايو)' : 'Two Days (29th & 30th May)';
    document.getElementById('chooseDayLabel').textContent = currentLanguage === 'ar' ? 'اختر اليوم:' : 'Select day:';
    document.getElementById('contactTitle').textContent = currentLanguage === 'ar' ? 'معلومات الاتصال' : 'Contact Information';
    document.getElementById('participantsTitle').textContent = currentLanguage === 'ar' ? 'المشاركون' : 'Participants';
    document.getElementById('paymentTitle').textContent = currentLanguage === 'ar' ? 'معلومات الدفع' : 'Payment Information';
    document.getElementById('submitBtn').textContent = currentLanguage === 'ar' ? 'إرسال التسجيل' : 'Submit Reservation';
    
    // Update remove button texts
    document.querySelectorAll('.remove-participant-btn').forEach(btn => {
        btn.textContent = currentLanguage === 'ar' ? '🗑️ حذف' : '🗑️ Remove';
    });
    
    calculateTotalPrice();
}

// Theme switching
function toggleTheme() {
    document.body.classList.toggle('dark');
    const btn = document.getElementById('themeBtn');
    btn.textContent = document.body.classList.contains('dark') ? '☀️ Light' : '🌙 Dark';
}

// Event Listeners
document.getElementById('oneDayBtn').addEventListener('click', () => {
    selectedDays = 'oneDay';
    document.getElementById('dayChoice').classList.remove('hidden');
    document.getElementById('oneDayBtn').classList.add('selected');
    document.getElementById('twoDaysBtn').classList.remove('selected');
    calculateTotalPrice();
});

document.getElementById('twoDaysBtn').addEventListener('click', () => {
    selectedDays = 'twoDays';
    document.getElementById('dayChoice').classList.add('hidden');
    document.getElementById('twoDaysBtn').classList.add('selected');
    document.getElementById('oneDayBtn').classList.remove('selected');
    calculateTotalPrice();
});

document.getElementById('selectedDay').addEventListener('change', (e) => {
    selectedOneDay = e.target.value;
    calculateTotalPrice();
});

document.getElementById('addParticipantBtn').addEventListener('click', addParticipant);
document.getElementById('reservationForm').addEventListener('submit', submitReservation);
document.getElementById('langBtn').addEventListener('click', toggleLanguage);
document.getElementById('themeBtn').addEventListener('click', toggleTheme);

// Initialize
loadGroups();