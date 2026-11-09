"""Run the real application with disposable UI review fixtures (localhost only)."""
import argparse
import os
import sys
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--sales-rows', type=int, default=28, choices=[28, 10000])
parser.add_argument('--port', type=int, default=5181)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
review_root = Path(tempfile.mkdtemp(prefix='infolens-ui-review-'))
os.environ.update(INFOLENS_OUTPUT_ROOT=str(review_root), INFOLENS_AUTH_MODE='off', INFOLENS_ENV='development')

import web
from infolens.extractor import ExtractResult, SavedImage
from infolens.sales import REQUIRED, SalesStore
from PIL import Image, ImageDraw

actor = dict(operator='ui-review', operator_name='界面验收')
names = ['晨光便利店', '云城生活超市', '悦来烟酒商行', '邻里优选便利店（社区生活服务中心一号店）']
routes = ['白云南路', '云城尚品', '龚家寨', '金园路']
for i in range(53):
    web.CUSTOMER_STORE.create_customer(dict(terminal_code=str(1090000000+i), customer_name=names[i%4]+(f'（{i//4+1}店）' if i>3 else ''), route=routes[i%4], salesperson='黄春梅', snow_salesperson='陈家利', status='运营' if i%7 else '停用', terminal_business_type='便利店', contact='测试联系人', phone='', address='测试地址', remark='用于界面回归的独立样本' if i%4==0 else ''), **actor)
products = []
for i in range(9):
    product = web.PRODUCT_STORE.create_product(dict(product_codes=[f'REVIEW-P{i+1}'], housekeeper_codes=[f'REVIEW-G{i+1}'], short_name=['勇闯天涯','纯生','喜力'][i%3]+f'（样本{i+1}）', product_name=f'界面回归商品{i+1}', brand=['雪花','喜力'][i%2], specification=12, auxiliary_unit='听', snow_inventory=100+i*20, cost_price='30.50', settlement_price='32.00', status='正常'), **actor)
    products.append(product)
    web.PRODUCT_POLICY_STORE.create(dict(product_id=product['id'],month='2026-11',price='28.50',quantity='100',remarks='测试政策'), 'ui-review')
for i in range(3):
    web.SNOW_OUTBOUND_STORE.create_policy(dict(policy_type='其他',name=f'陈列政策{i+1}',enabled=True,normal_sale_product_ids=[products[i]['id']],gift_product_ids=[products[i]['id']],gift_type='陈列赠酒',outbound_code=f'UI-REVIEW-{i+1}',explanation='界面回归样本',requires_photo=True,set_limit=10,month_target=25,year=2026,month=11,conditions=[dict(field='outbound_remark',operator='contains',value=f'REVIEW-{i+1}')]), **actor)
sales = []
for i in range(args.sales_rows):
    source = dict.fromkeys(REQUIRED,'')
    source.update({'单据日期':'2026-11-08','单据类型':'销售单','单据编号':f'UI-202611-{i+1:03}','存货编号':f'REVIEW-G{i%9+1}','存货全名':f'界面回归商品{i%9+1}','客户全名':names[i%4],'经办人全名':'黄春梅','数量':24,'单位':'听','辅1数量':2,'折后单价':5,'折后金额':120,'成本单价':3,'行摘要':'正常销售'})
    sales.append({'source':source,'date':source['单据日期']})
SalesStore(review_root/'_system'/'sales.sqlite3').upload(REQUIRED,sales,'UI回归样本.xlsx')
for i in range(3):
    folder = review_root/f'fixture-{i}'
    folder.mkdir()
    image = Image.new('RGB',(480,320),(225-i*12,232-i*10,240))
    ImageDraw.Draw(image).text((24,24),f'UI REVIEW / TERMINAL {i+1}',fill=(50,60,70))
    image.save(folder/'fixture.jpg')
    web.IMAGE_LIBRARY.add_result(ExtractResult(visit_id=f'UI-VISIT-{i}',terminal_name=names[i],partner_name='黄春梅',output_dir=str(folder),images=[SavedImage(index=1,photoid=f'private/UI/20261108/{1090000000+i}/fixture.jpeg',filename='fixture.jpg',url='',size_bytes=(folder/'fixture.jpg').stat().st_size)],metadata_file=str(folder/'metadata.json'),visit_in_time='2026-11-08 09:00:00'),created_at='2026-11-08T09:00:00')
web.USER_STORE.create_user(username='ui-review-user',display_name='测试用户',password='ReviewOnly-2026',role='user',status='enabled')
web.app.extensions['notifications'].add('客户导入','partial_success','ui-review','界面验收','UI样本.xlsx',details={'errors':[{'row':2,'message':'终端编码重复'}]})
# Visual-only login fixture. It cannot authenticate or submit credentials.
web.app.add_url_rule('/ui-review/login', 'ui_review_login', lambda: (web.WEB_ROOT/'login.html').read_text().replace('{{CSRF_TOKEN}}','ui-review-only').replace('{{ERROR}}',''))
print(f'Disposable UI fixtures: {review_root}', flush=True)
print(f'UI preview: http://127.0.0.1:{args.port}/', flush=True)
web.app.run(host='127.0.0.1',port=args.port,debug=False,threaded=True)
