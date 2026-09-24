with open(r'c:\Users\User\Desktop\School_website_antigravity\mge-portal\prisma\seed.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's locate the user seeding block in seed.ts
start_idx = content.find('// 5. Seed Users')
if start_idx == -1:
    start_idx = content.find('users')

if start_idx != -1:
    print(content[start_idx:start_idx+4000])
else:
    print("Could not find users section.")
