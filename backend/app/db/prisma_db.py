import logging
from prisma import Prisma

logger = logging.getLogger(__name__)
prisma = Prisma()

async def connect_prisma():
    try:
        if not prisma.is_connected():
            logger.info("Connecting to Prisma query engine...")
            await prisma.connect(timeout=15)
            logger.info("Prisma connected successfully.")
    except Exception as e:
        logger.error(f"WARNING: Could not connect to Prisma: {e}. Fallback mechanisms will be used.")

async def disconnect_prisma():
    try:
        if prisma.is_connected():
            await prisma.disconnect()
    except Exception as e:
        logger.warning(f"Error disconnecting Prisma: {e}")
