import random, sys
from PIL import Image
random.seed(7)
N=64
# Fine speckle only: nothing large enough to show the 64 px repeat.
im=Image.new("P",(N,N)); ip=im.load()
for y in range(N):
    for x in range(N): ip[x,y]=random.choice([0,0,1,1,1,2,2,3,4])
im.putpalette([0,0,0]*5)
im.save(sys.argv[1],optimize=True,transparency=bytes([0,3,6,9,13]))
