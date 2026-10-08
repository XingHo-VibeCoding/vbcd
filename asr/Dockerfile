# fun-asr 转写微服务镜像
# 本机 Docker Hub 不可达时（AGENTS.md §7），先在本机执行：
#   docker pull docker.m.daocloud.io/library/python:3.11-slim
#   docker tag docker.m.daocloud.io/library/python:3.11-slim python:3.11-slim
# 或使用 build-arg 换 pip 源：--build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
FROM python:3.11-slim

ARG PIP_INDEX_URL=https://pypi.org/simple
ARG APT_MIRROR=                 # 可选：apt 换源（国内机器 http://mirrors.aliyun.com 秒下）

# ffmpeg/ffprobe 是硬依赖（下载后归一化 + 静音检测 + 切片）
# APT_MIRROR 非空时先把 sources 换过去：海外/国内 ECS 直连 archive.ubuntu.com 常卡死
RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|http://deb.debian.org|$APT_MIRROR|g; s|http://archive.ubuntu.com|$APT_MIRROR|g" \
            /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（命中构建缓存），再拷代码
COPY asr/requirements.txt /app/asr/requirements.txt
RUN pip install --no-cache-dir -i "$PIP_INDEX_URL" -r /app/asr/requirements.txt

COPY asr/ /app/asr/

# 运行时产物（临时媒体 + job JSON）放 /app/jobs，compose 挂命名卷
ENV JOBS_DIR=/app/jobs \
    ASR_HOST=0.0.0.0 \
    ASR_PORT=8000 \
    PYTHONUNBUFFERED=1

# 非 root 运行；jobs 目录属主交给 runtime 用户
RUN useradd -r -u 10001 -m asr \
    && mkdir -p /app/jobs \
    && chown -R asr:asr /app/jobs
USER asr

EXPOSE 8000

# 单进程（job 状态在进程内 + 磁盘 JSON；多 workers 会破坏单飞与进度一致性）
CMD ["python", "-m", "uvicorn", "asr.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
