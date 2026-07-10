console.log("TaskFlow System: Core Connected");

function liveSearch() {
    const input = document.getElementById('fbSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.task-card, .bcard, tr');
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if(text.includes(input)) {
            card.style.display = "";
            card.style.opacity = "1";
        } else {
            card.style.opacity = "0";
            card.style.display = "none";
        }
    });
}
