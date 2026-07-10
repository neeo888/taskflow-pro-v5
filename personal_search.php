<?php
if (isset($_GET["action"]) && $_GET["action"] == "search_mysql") {
    $conn = new PDO("mysql:host=localhost;dbname=taskflow;charset=utf8mb4", "root", "");
    $kw = isset($_GET["kw"]) ? trim($_GET["kw"]) : "";
    if ($kw === "") { echo json_encode([]); exit; }
    $stmt = $conn->prepare("SELECT *, CASE WHEN task_name LIKE :kw1 THEN 3 WHEN task_name LIKE :kw2 THEN 2 ELSE 1 END AS relevance_score FROM project_tasks WHERE task_name LIKE :kw3 ORDER BY relevance_score DESC, task_id DESC LIMIT 5");
    $stmt->execute(["kw1" => $kw . "%", "kw2" => "%" . $kw . "%", "kw3" => "%" . $kw . "%"]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}
?>
<script>(function(){
function injectSearch(){
    // 🎯 1. ดักจับไอดีแถบข้าง (#sidenav) และแผงเนื้อหาหลัก (#content) ของจริงในระบบ
    let sidebar = document.getElementById("sidenav") || document.querySelector(".sidenav");
    let content = document.getElementById("content") || document.querySelector(".content");
    
    if(!sidebar) return;

    // 🎯 2. สั่งขยายขนาดโครงสร้างแถบข้างซ้ายให้กว้างขวางอย่างเหมาะสมเป็น 300px ถาวร
    sidebar.style.width = "300px";
    sidebar.style.minWidth = "300px";
    
    // 🎯 3. สั่งให้บอร์ดเนื้อหาหลักฝั่งขวาขยับหลบอย่างอัจฉริยะ ไม่มีการซ้อนทับกัน
    if(content){
        content.style.marginLeft = "300px";
    }

    if(document.getElementById("personalTaskSearch")) return;

    let container = document.createElement("div");
    container.className = "search-personal-container";
    
    // จัดช่องไฟในแถบเมนูข้างซ้ายให้เนี๊ยบกริบ ทิ้งระยะสวยงามตามอารยสถาปัตย์
    container.style.cssText = "position: relative!important; padding: 15px!important; width: 100%!important; box-sizing: border-box!important; z-index: 9999!important; display: block!important;";
    
    // ออกแบบกล่องแคปซูลขาว Luxury ขยายขนาดเต็มพิกัด 300px พิมพ์ง่ายสบายตา
    container.innerHTML = `<input type="text" id="personalTaskSearch" placeholder="🔍 ค้นหางานด่วนจาก MySQL..." style="width:100%!important;height:38px!important;padding:0 12px 0 35px!important;border:1px solid #CBD5E1!important;border-radius:20px!important;font-size:13px!important;background:#FFFFFF!important;color:#1E293B!important;outline:none!important;transition:all 0.25s ease;box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);" autocomplete="off">`;
    
    // แทรกเข้าบรรทัดแรกสุดของ Sidebar
    sidebar.insertBefore(container, sidebar.firstChild);

    let inp = document.getElementById("personalTaskSearch");
    if(inp){
        // เอฟเฟกต์เรืองแสงนีออนมินท์อ่อน ๆ ดึงดูดสายตาระดับสูงเมื่อโฟกัส
        inp.onfocus = function(){
            this.style.border = "1px solid #2DD4BF";
            this.style.boxShadow = "0 0 12px rgba(45,212,191,0.4)";
        };
        inp.onblur = function(){
            setTimeout(() => {
                this.style.border = "1px solid #CBD5E1";
                this.style.boxShadow = "none";
            }, 250);
        };

        inp.oninput = function(e){
            let kw = e.target.value.trim().toLowerCase();
            if(kw === ""){
                let old = document.querySelectorAll(".mysql-search-result-container-box");
                old.forEach(r => r.remove());
                return;
            }
            fetch("personal_search.php?action=search_mysql&kw="+encodeURIComponent(kw))
            .then(res => res.json())
            .then(data => {
                let old = document.querySelectorAll(".mysql-search-result-container-box");
                old.forEach(r => r.remove());
                
                let rd = document.createElement("div");
                rd.className = "mysql-search-result-container-box";
                // 🎯 แผง Dropdown ดีดตัวลงล็อกสมมาตรในกรอบ 300px พอดีเป๊ะ สวยงาม คมชัด ไม่ล้นหลุดไปทับกระดานหลักขวา
                rd.style.cssText = "position:absolute!important;top:54px!important;left:15px!important;width: calc(100% - 30px)!important;padding:8px;background:#FFFFFF;border-radius:12px;border:1px solid #2DD4BF;z-index:999999!important;max-height:280px;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.12); border-top: 4px solid #2DD4BF;";
                
                if(data.length === 0){
                    rd.innerHTML = "<p style='color:#64748B;font-size:12px;margin:8px;text-align:center;'>❌ ไม่พบข้อมูลงาน</p>";
                } else {
                    data.forEach(item => {
                        let cleanName = item.task_name.replace(/'/g, "\\'");
                        rd.innerHTML += `<div onclick="window.personalSearchGoTask('${cleanName}')" style="display:block!important;padding:10px!important;background:#F8FAFC!important;margin-bottom:6px!important;border-radius:8px!important;border-left:4px solid #2DD4BF!important;font-size:12px!important;color:#1E293B!important;text-align:left!important;cursor:pointer!important;transition:all 0.2s;font-weight:500;" onmouseover="this.style.background='#E6F4F1';this.style.transform='translateX(4px)';" onmouseout="this.style.background='#F8FAFC';this.style.transform='none';">📌 ${item.task_name}</div>`;
                    });
                }
                e.target.parentNode.appendChild(rd);
            });
        };
    }
}
window.personalSearchGoTask = function(taskName){
    let f = false;
    let targetWord = taskName.trim().replace(/📌/g, "").substring(0, 10).toLowerCase();
    document.querySelectorAll("body *, div, td, span, h5, p, .task-item, a, button").forEach(el => {
        if (el.innerText && el.innerText.toLowerCase().includes(targetWord) && el.childNodes.length <= 3) {
            let c = el.closest("a, button, tr, div[onclick], .task-item, li") || el;
            if (c && typeof c.click === "function" && c.id !== "personalTaskSearch") {
                c.click();
                f = true;
            }
        }
    });
    if(f){
        document.querySelectorAll(".mysql-search-result-container-box").forEach(r => r.remove());
        let inp = document.getElementById("personalTaskSearch");
        if(inp) { inp.value = ""; inp.blur(); }
    } else {
        alert("พบงานในระบบหลังบ้าน แต่ระบบไม่สามารถจำลองการคลิกบนหน้าจอนี้ได้ กรุณาเปิดหน้าแดชบอร์ดหลักที่มีตารางงานแสดงอยู่ครับ");
    }
};
setInterval(injectSearch, 1000);
})();</script>