# ubuntu22.04
FROM gnom878/dev-box-ubuntu:22.04

##############################
# initialize
##############################
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /workspace

COPY requirements.txt /workspace/

# コピーされたことを確認する
RUN ls -al /workspace

# パッケージ更新 & Python + Node.js インストール
RUN apt-get update && \
    apt-get install -y \
    python3 python3-pip \
    curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*



RUN pip install -r requirements.txt