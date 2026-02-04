#!/usr/bin/env python3
import socket
import concurrent.futures
import csv
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import argparse
import warnings
from urllib3.exceptions import InsecureRequestWarning

# تجاهل تحذيرات SSL لأغراض المسح الداخلي
warnings.filterwarnings("ignore", category=InsecureRequestWarning)

def check_web_server(ip, port, timeout=1):
    """فحص إذا كان المنفذ مفتوحاً"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return result == 0
    except:
        return False

def get_page_title(ip, port):
    """جلب عنوان الصفحة مع معلومات إضافية"""
    try:
        protocol = "https" if port == 443 else "http"
        url = f"{protocol}://{ip}:{port}"

        # إعدادات الطلب
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(
            url,
            timeout=3,
            verify=False,
            headers=headers,
            allow_redirects=True
        )

        soup = BeautifulSoup(response.text, 'html.parser')

        # جلب العنوان
        if soup.title and soup.title.string:
            title = soup.title.string.strip()[:100]  # قص العنوان الطويل
        else:
            title = "No Title"

        # جلب معلومات إضافية
        server_type = response.headers.get('Server', 'Unknown')
        content_type = response.headers.get('Content-Type', 'Unknown').split(';')[0]

        return title, server_type, content_type, response.status_code

    except requests.exceptions.SSLError:
        return "SSL Error", "Unknown", "Unknown", 0
    except requests.exceptions.Timeout:
        return "Timeout", "Unknown", "Unknown", 0
    except requests.exceptions.ConnectionError:
        return "Connection Error", "Unknown", "Unknown", 0
    except Exception as e:
        return f"Error: {str(e)[:50]}", "Unknown", "Unknown", 0

def scan_ip_port(args):
    """دالة للفحص تستخدم في Threading"""
    ip, port, timeout = args

    if check_web_server(ip, port, timeout):
        title, server, content_type, status = get_page_title(ip, port)
        return ip, port, title, server, content_type, status, datetime.now().strftime("%H:%M:%S")

    return None

def main():
    # إعداد CLI Arguments
    parser = argparse.ArgumentParser(description='مسح خوادم الويب على الشبكة المحلية')
    parser.add_argument('--network', default='192.168.1', help='نطاق الشبكة (default: 192.168.1)')
    parser.add_argument('--ports', default='80,443,8080,8000,3000', help='المنافذ للفحص (comma-separated)')
    parser.add_argument('--threads', type=int, default=50, help='عدد الخيوط المتوازية (default: 50)')
    parser.add_argument('--timeout', type=float, default=1, help='وقت انتظار الفحص (default: 1)')
    parser.add_argument('--output', default='scan_results', help='اسم ملف المخرجات (بدون امتداد)')

    args = parser.parse_args()

    # تحويل المنافذ إلى قائمة
    ports = [int(p) for p in args.ports.split(',')]

    # إعداد اسماء الملفات
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_file = f"{args.output}_{timestamp}.csv"
    txt_file = f"{args.output}_{timestamp}.txt"

    print(f"🚀 بدء فحص الشبكة {args.network}.0/24")
    print(f"🔍 المنافذ: {ports}")
    print(f"⚡ الخيوط: {args.threads}")
    print(f"⏱️  المهلة: {args.timeout} ثانية")
    print("=" * 50)

    # إعداد قائمة المهام
    tasks = []
    for i in range(1, 255):
        ip = f"{args.network}.{i}"
        for port in ports:
            tasks.append((ip, port, args.timeout))

    # تشغيل الفحص المتوازي
    found_servers = 0
    with open(csv_file, 'w', newline='', encoding='utf-8') as csv_f:
        csv_writer = csv.writer(csv_f)
        csv_writer.writerow(['IP', 'Port', 'Title', 'Server', 'Content-Type', 'Status', 'Time'])

        with open(txt_file, 'w', encoding='utf-8') as txt_f:
            txt_f.write(f"نتائج فحص الشبكة - {datetime.now()}\n")
            txt_f.write(f"الشبكة: {args.network}.0/24\n")
            txt_f.write(f"المنافذ: {ports}\n")
            txt_f.write("=" * 60 + "\n\n")

            with concurrent.futures.ThreadPoolExecutor(max_workers=args.threads) as executor:
                future_to_task = {executor.submit(scan_ip_port, task): task for task in tasks}

                for future in concurrent.futures.as_completed(future_to_task):
                    result = future.result()
                    if result:
                        ip, port, title, server, content_type, status, scan_time = result

                        # طباعة النتيجة
                        print(f"✅ {ip}:{port} | {title} | Server: {server}")

                        # حفظ في CSV
                        csv_writer.writerow([ip, port, title, server, content_type, status, scan_time])

                        # حفظ في TXT
                        txt_f.write(f"📍 {ip}:{port}\n")
                        txt_f.write(f"   العنوان: {title}\n")
                        txt_f.write(f"   السيرفر: {server}\n")
                        txt_f.write(f"   نوع المحتوى: {content_type}\n")
                        txt_f.write(f"   الحالة: {status}\n")
                        txt_f.write(f"   وقت الاكتشاف: {scan_time}\n")
                        txt_f.write("-" * 40 + "\n")

                        found_servers += 1

    # إضافة اقتراحات sqlmap
    with open(txt_file, 'a', encoding='utf-8') as txt_f:
        txt_f.write("\n🔧 اقتراحات للفحص الأعمق باستخدام sqlmap:\n")
        txt_f.write("=" * 60 + "\n")

        # قراءة النتائج من CSV
        with open(csv_file, 'r', encoding='utf-8') as csv_f:
            reader = csv.DictReader(csv_f)
            for row in reader:
                protocol = "https" if row['Port'] == '443' else "http"
                url = f"{protocol}://{row['IP']}:{row['Port']}"
                txt_f.write(f"# sqlmap -u \"{url}/\" --batch --crawl=2 --level=2\n")

    print("\n" + "=" * 50)
    print(f"✅ تم الانتهاء من الفحص!")
    print(f"📊 تم العثور على {found_servers} خادم ويب")
    print(f"💾 تم حفظ النتائج في:")
    print(f"   • {csv_file} (تنسيق CSV)")
    print(f"   • {txt_file} (تقرير تفصيلي)")

    if found_servers > 0:
        print("\n🔗 لبدء فحص sqlmap، استخدم:")
        print(f"   cat {txt_file} | grep 'sqlmap' | head -5")

if __name__ == "__main__":
    main()