from PIL import Image, ImageDraw

def main():
    img = Image.open('public/logo.jpg')
    print("Dimensions:", img.size)
    print("Mode:", img.mode)

if __name__ == '__main__':
    main()
