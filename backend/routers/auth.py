from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User
from schemas import SignupRequest, LoginRequest, UserOut, TokenResponse
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
ADMIN_EMAILS = frozenset({
    "drishtikhandor108@gmail.com",
    "khandoraagam@gmail.com",
    "kutchfabrics@gmail.com",
})

bearer = HTTPBearer(auto_error=False)


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": exp},
        get_settings().secret_key,
        algorithm=ALGORITHM,
    )


@router.post("/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar():
        raise HTTPException(400, "Email already registered. Please sign in.")
    user = User(
        email=email,
        password_hash=_hash(payload.password),
        is_admin=email in ADMIN_EMAILS,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(token=_create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar()
    if not user or not _verify(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return TokenResponse(token=_create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, get_settings().secret_key, algorithms=[ALGORITHM]
        )
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid or expired token")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return UserOut.model_validate(user)
