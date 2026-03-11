from prisma import Prisma

prisma = Prisma()

async def connect_prisma():
    if not prisma.is_connected():
        await prisma.connect()

async def disconnect_prisma():
    if prisma.is_connected():
        await prisma.disconnect()
