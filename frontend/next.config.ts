import type { NextConfig } from "next";

const allowedDevOrigins = (
  process.env.CODE_TUTOR_ALLOWED_DEV_ORIGINS ?? "192.168.1.131"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
