# -*- coding: utf-8 -*-
from flask import Flask, render_template_string

app = Flask(__name__)

# هذا المتغير يحتوي على كود الواجهة بالكامل (HTML + CSS + JS)
HTML_CODE = """
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CYBER-GAMES 2077</title>
    <style>
        :root {
            --neon-pink: #ff00ff;
            --neon-blue: #00f3ff;
            --dark-bg: #0d0221;
        }
        body {
            background-color: var(--dark-bg);
            background-image: linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px);
            background-size: 30px 30px;
            color: white;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .cyber-card {
            background: rgba(13, 2, 33, 0.95);
            border: 2px solid var(--neon-blue);
            box-shadow: 0 0 20px var(--neon-blue);
            padding: 30px;
            width: 400px;
            text-align: center;
            position: relative;
        }
        h1 { color: var(--neon-pink); text-shadow: 0 0 10px var(--neon-pink); }
        .btn {
            background: transparent;
            border: 1px solid var(--neon-blue);
            color: var(--neon-blue);
            padding: 10px;
            margin: 8px 0;
            cursor: pointer;
            width: 100%;
            font-weight: bold;
        }
        .btn:hover { background: var(--neon-blue); color: black; box-shadow: 0 0 15px var(--neon-blue); }
        input {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--neon-pink);
            color: white;
            padding: 10px;
            width: 90%;
            margin-bottom: 10px;
            text-align: center;
        }
        .display { margin-top: 20px; padding: 15px; border: 1px dashed var(--neon-blue); background: rgba(0, 243, 255, 0.05); }
        .hidden { display: none; }
        .back { color: var(--neon-pink); cursor: pointer; display: block; margin-top: 15px; font-size: 13px; }
    </style>
</head>
<body>
    <div class="cyber-card">
        <div id="menu">
            <h1>CYBER CORE 2077</h1>
            <button class="btn" onclick="openP('rps')">حجر ورقة مقص</button>
            <button class="btn" onclick="openP('age')">ماسح العمر</button>
            <button class="btn" onclick="openP('guess')">تخمين الكود</button>
        </div>

        <div id="rps" class="hidden">
            <h3>PROTOCOL: RPS</h3>
            <button class="btn" onclick="play('حجر')">حجر</button>
            <button class="btn" onclick="play('ورقة')">ورقة</button>
            <button class="btn" onclick="play('مقص')">مقص</button>
            <div id="res-rps" class="display"></div>
            <span class="back" onclick="goBack()">العودة للنظام</span>
        </div>

        <div id="age" class="hidden">
            <h3>SCANNER</h3>
            <input type="text" id="n" placeholder="الاسم">
            <input type="number" id="a" placeholder="العمر">
            <button class="btn" onclick="scan()">تحليل</button>
            <div id="res-age" class="display"></div>
            <span class="back" onclick="goBack()">العودة للنظام</span>
        </div>

        <div id="guess" class="hidden">
            <h3>CRACKER</h3>
            <input type="number" id="gv" placeholder="1-50">
            <button class="btn" onclick="crack()">محاولة</button>
            <div id="res-guess" class="display"></div>
            <span class="back" onclick="goBack()">العودة للنظام</span>
        </div>
    </div>

    <script>
        function openP(id) {
            document.getElementById('menu').classList.add('hidden');
            document.getElementById(id).classList.remove('hidden');
        }function goBack() {
            document.querySelectorAll('.cyber-card > div').forEach(d => d.classList.add('hidden'));
            document.getElementById('menu').classList.remove('hidden');
        }
        function play(u) {
            const op = ['حجر', 'ورقة', 'مقص'];
            const b = op[Math.floor(Math.random()*3)];
            let r = نظام: ${b} | أنت: ${u}<br>;
            r += (u==b) ? "تعادل" : ((u=='حجر'&&b=='مقص')||(u=='ورقة'&&b=='حجر')||(u=='مقص'&&b=='ورقة')) ? "فوز!" : "خسارة";
            document.getElementById('res-rps').innerHTML = r;
        }
        function scan() {
            const name = document.getElementById('n').value;
            const age = document.getElementById('a').value;
            document.getElementById('res-age').innerHTML = المستخدم: ${name}<br>عشت ${age*8760} ساعة في النظام.;
        }
        let target = Math.floor(Math.random()*50)+1;
        function crack() {
            const v = document.getElementById('gv').value;
            const out = document.getElementById('res-guess');
            if(v < target) out.innerText = "أكبر..";
            else if(v > target) out.innerText = "أصغر..";
            else { out.innerText = "تم الاختراق!"; target = Math.floor(Math.random()*50)+1; }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    # نقوم بتمرير النص البرمجي مباشرة للمتصفح
    return render_template_string(HTML_CODE)

if name == '__main__':
    app.run(debug=True)