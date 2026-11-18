"""Sample colour plates: one soft draped-fabric image per sample product, in the product's own colour.
Usage: python tools/make-plates.py prods.json out_dir   (prods.json: [{id, slug, name, cat, color}])"""
import json, math, os, sys, hashlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

C = {'crimson':'#9E1B32','emerald':'#0F6B4F','gold':'#C6A052','saffron':'#E08A1E','wine':'#6E1F36','peacock':'#0E5E6F','blush':'#E8B4B8',
 'sage':'#8A9A7B','beige':'#D9C3A0','sand':'#CDB58F','indigo':'#2E3A78','coral':'#E5604D','lilac':'#B7A1D1','ruby':'#9B1239','mint':'#9FD3B8',
 'peach':'#F2B38F','teal':'#1E7F86','rose':'#D6718A','ivory':'#EFE6D2','fuchsia':'#C2185B','mustard':'#D6A021','navy':'#1B2A4E','white':'#F3EFE8',
 'maroon':'#6E2027','blue':'#4F7CC0','pastel':'#D8C7E3','midnight':'#1B1F3B','magenta':'#B5176B','rust':'#B5532A','aqua':'#4FBFC0',
 'dusty':'#C98B96','parrot':'#5DAA3E','lemon':'#EAD94F','burgundy':'#6D1530','green':'#2F7A4B','black':'#201A1A','terracotta':'#A94F37',
 'royal':'#2745A8','plum':'#5A2750','antique':'#B08D3E','red':'#B02A2A','champagne':'#E9D3B1','olive':'#6F7442'}
HINT = {'banarasi':'#8E2430','chanderi':'#E9DFC6','kanjivaram':'#9E1B32','plum':'#5A2750','rose':'#D6718A','champagne':'#E9D3B1','onyx':'#252021','gold':'#C6A052','dusk':'#5B4E7A'}

def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def pick(p):
    col = (p['color'] or '').lower()
    for k,v in C.items():
        if k in col: return hexrgb(v)
    for k,v in HINT.items():
        if k in p['slug']: return hexrgb(v)
    h = int(hashlib.md5(p['slug'].encode()).hexdigest(),16)
    return hexrgb(list(C.values())[h % len(C)])

def mix(a,b,t): return tuple(int(a[i]*(1-t)+b[i]*t) for i in range(3))
def font(sz, bold=False):
    for f in ('C:/Windows/Fonts/georgiab.ttf' if bold else 'C:/Windows/Fonts/georgia.ttf','C:/Windows/Fonts/times.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

W,H = 720,960
def plate(p):
    base = pick(p); light = mix(base,(255,255,255),.38); dark = mix(base,(0,0,0),.42)
    img = Image.new('RGB',(W,H)); px = img.load()
    ph = (int(hashlib.md5(p['slug'].encode()).hexdigest()[:4],16) % 628)/100
    for y in range(H):
        for x in range(W):
            # soft diagonal folds, like cloth falling from a shoulder
            f = math.sin((x*.9 + y*.35)/58 + ph) * .5 + math.sin((x*.4 - y*.8)/97 + ph*1.7) * .35
            t = max(0,min(1,.5 + f*.42 + (y/H - .5)*.25))
            px[x,y] = mix(dark,light,t)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img,'RGBA')
    gold = (198,160,82)
    if p['cat'] in ('sarees','festive','dupattas'):   # woven border bands
        for off,w in ((0,38),(52,6),(66,3)):
            d.rectangle([0,H-96+off,W,H-96+off+w],fill=gold+(215 if w>10 else 190,))
    d.rectangle([22,22,W-22,H-22],outline=gold+(190,),width=2)
    d.rectangle([32,32,W-32,H-32],outline=gold+(90,),width=1)
    ink = (255,255,255,235) if sum(base)<520 else (33,23,20,235)
    f1,f2 = font(22,True), font(15)
    d.text((W/2,70),'DHANYA BOUTIQUE',font=f1,fill=ink,anchor='mm')
    name = p['name'].split(' · ')[0]
    d.text((W/2,H/2-6),name,font=font(34,True),fill=ink,anchor='mm')
    if ' · ' in p['name']: d.text((W/2,H/2+34),p['name'].split(' · ',1)[1],font=font(22),fill=ink,anchor='mm')
    d.text((W/2,H-118 if p['cat'] in ('sarees','festive','dupattas') else H-62),'SAMPLE IMAGE · REPLACE IN ADMIN',font=f2,fill=ink,anchor='mm')
    return img

if __name__ == '__main__':
    prods = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]; os.makedirs(out,exist_ok=True)
    for p in prods: plate(p).save(os.path.join(out,f"{p['slug']}.jpg"),quality=80,optimize=True)
    print(len(prods),'plates')
