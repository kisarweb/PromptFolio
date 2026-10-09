# PRD — PromptFolio: Plataforma de Engenharia de Prompts, Meta-Agentes e Execução Multimodal via MCP

## 1. Visão Geral do Produto
O **PromptFolio** é uma aplicação web híbrida (Software SaaS + Interface de Chat) voltada para a criação, refinamento, catalogação categorizada e execução de Prompts e Agentes de IA.
O sistema separa estritamente dois ambientes:
1. **Estúdio Construtor (Builder):** Onde o usuário conversa com agentes especialistas para arquitetar novos Agentes e novos Prompts (com trava de agente por conversa para impedir alucinação).
2. **Estúdio Executor (Delivery):** Focado exclusivamente na entrega final dividida em **Imagens, Vídeos, Áudios e Textos**, consumindo conectores MCP (Google Nano Banana 2, OpenAI/ChatGPT, Runway, etc.).

**Diferencial de Armazenamento (Zero-Friction + Multi-Cloud):**
Ao fazer login com a conta Google, o **Google Drive MCP** do usuário já é vinculado automaticamente como **armazenamento padrão inicial** para salvar todas as mídias geradas. Nas Configurações, o usuário pode a qualquer momento trocar o armazenamento padrão para **Cloudflare R2** ou **AWS S3**, contando com páginas de tutoriais passo a passo dentro do próprio aplicativo.

---

## 2. Stack Tecnológica (Arquitetura Replit)
- **Frontend:** React (Vite) + TypeScript + Tailwind CSS + shadcn/ui + Lucide Icons.
- **Estado, Tema e Idioma:** Zustand + TanStack Query + `i18next` (**Português `pt-BR`** e **Inglês `en-US`** completos) + Tema **Claro (Light)** e **Escuro (Dark)**.
- **Backend:** Python 3.11+ com **FastAPI** (arquitetura assíncrona e modular).
- **Banco de Dados:** PostgreSQL + SQLAlchemy (Async) + Alembic.
- **Autenticação e Vínculo Automático com Drive:** Google OAuth 2.0 (`openid`, `email`, `profile` e `https://www.googleapis.com/auth/drive.file`) com armazenamento seguro de `access_token` e `refresh_token`.
- **Segurança (Cofre BYOK):** Criptografia simétrica `AES-256-GCM` (`cryptography.fernet`) para chaves de API, endpoints MCP, tokens OAuth e credenciais AWS S3 / Cloudflare R2.
- **Motores de Armazenamento:**
  - **Google Drive MCP / API v3:** Padrão automático pós-login.
  - **Cloudflare R2 & AWS S3:** Cliente unificado via `boto3` (S3-compatible).

---

## 3. Arquitetura de Módulos e Fluxo de Uso

### 3.1. Login Google com Provisionamento Automático do Google Drive MCP
1. O usuário acessa a tela de login e entra com sua **Conta Google**.
2. No primeiro login, o backend cria o perfil do usuário e **ativa automaticamente o conector `google_drive_mcp` como Provedor de Armazenamento Padrão (`is_default = True`)**.
3. O sistema verifica/cria automaticamente na raiz do Google Drive do usuário uma pasta chamada **`PromptFolio`** com 4 subpastas organizadas por modalidade e categoria:
   - `/PromptFolio/Imagens/<Categoria>/`
   - `/PromptFolio/Videos/<Categoria>/`
   - `/PromptFolio/Audios/<Categoria>/`
   - `/PromptFolio/Textos/<Categoria>/`
4. *Modo Dev/Preview Replit:* Incluir um botão de "Login Demo Local" caso as credenciais OAuth do Google ainda não estejam configuradas no ambiente de desenvolvimento, simulando o fluxo até que as chaves reais sejam inseridas.

### 3.2. Módulo 1: Estúdio Construtor (Builder Chat)
Menus separados na barra lateral para criação e refinamento:
- **Menu A: Construtor de Agentes (Meta-Agentes):** Conversas guiadas para criar System Prompts, instruções técnicas, tom de voz e regras de novos agentes.
- **Menu B: Construtor de Prompts:** Conversas guiadas para construir prompts estruturados e parametrizáveis (suporte a variáveis dinâmicas no formato `{{sujeito}}`, `{{estilo}}`, `{{iluminacao}}`, `{{camera}}`).

**Regras Críticas do Estúdio Construtor:**
1. **Trava de Agente por Conversa (Anti-Alucinação):**
   - Antes de enviar a primeira mensagem, o usuário escolhe qual Agente Construtor conduzirá aquela sessão.
   - Após o envio da 1ª mensagem, o seletor de agente fica **permanentemente travado (`locked_agent_id`)** naquela conversa. O usuário nunca pode trocar de agente no meio da thread, garantindo contexto puro e foco único no refinamento.
2. **Botão "Salvar e Publicar" com Card de Revisão Final:**
   - Quando o agente ou prompt atinge a versão ideal, o usuário clica em **"Salvar e Publicar"** no topo do chat.
   - Abre-se um **Card/Modal de Revisão Final** onde o usuário confere o texto consolidado, define **Título**, **Categoria**, **Pasta**, **Tags**, **Variáveis Dinâmicas**, **Modalidade de Destino** (`Imagem`, `Vídeo`, `Áudio` ou `Texto`) e **Provedor MCP sugerido**, publicando-o com 1 clique para uso no Estúdio Executor.

### 3.3. Módulo 2: Estúdio Executor (Delivery Workspace)
Menu separado e independente do Construtor. Aqui o usuário **apenas executa** os Prompts e Agentes publicados para obter entregas finais.
- **4 Abas de Entrega Especializadas:**
  1. **Entregar Imagens:** Grid visual de resultados, seletor de proporção (`1:1`, `16:9`, `9:16`), integração com Google (**Nano Banana 2** / Imagen), OpenAI e Runway MCP.
  2. **Entregar Vídeos:** Player de vídeo integrado, controle de duração/aspect ratio, integração com **Runway MCP** e Google Veo.
  3. **Entregar Áudios:** Player de áudio com barra de progresso/ondas sonoras e geração de voz/efeitos.
  4. **Entregar Textos:** Visualizador Markdown formatado com cópia em 1 clique e exportação `.md`/`.txt`.
- **Preenchimento de Variáveis:** Se o prompt escolhido tiver variáveis (`{{...}}`), o painel lateral gera automaticamente inputs de formulário para o usuário preencher antes de clicar em "Executar".
- **Download Local + Salvamento Automático em Nuvem:**
  - Toda entrega possui botão de **Download Local Imediato**.
  - **Auto-Save Inteligente:** Toda mídia gerada (imagem, vídeo, áudio ou documento de texto) é enviada automaticamente em background para o armazenamento padrão ativo do usuário:
    - Por padrão inicial: vai direto para a pasta correspondente no **Google Drive MCP** da conta logada.
    - Se alterado nas Configurações: vai direto para o bucket **Cloudflare R2** ou **AWS S3**.
  - O card da mídia exibe um selo de confirmação: *"Salvo em: Google Drive"* (ou *"Salvo em: Cloudflare R2"* / *"AWS S3"*), com link direto para abrir o arquivo na nuvem.

### 3.4. Módulo 3: Catálogo PromptFolio (Biblioteca Categorizada)
- Biblioteca central com busca instantânea, filtros por Categoria, Pastas, Tags e Modalidade (`Imagem`, `Vídeo`, `Áudio`, `Texto`).
- Cada card de Prompt exibe sua versão atual, variáveis necessárias, agente/MCP vinculado e uma miniatura das últimas mídias geradas com ele.
- Opção de importar/exportar coleções de prompts em JSON/Markdown (incluindo backup direto no Google Drive).

### 3.5. Módulo 4: Configurações (Idioma, Tema, Agentes, MCPs e Storage)
Painel administrativo separado dos menus de criação, organizado em 4 abas:
1. **Aparência e Idioma:**
   - Seletor de Idioma: **Português (PT-BR)** e **Inglês (EN-US)** traduzindo toda a interface.
   - Seletor de Tema: **Claro (Light)** e **Escuro (Dark)**.
2. **Configuração de Agentes Base:**
   - Gerenciamento dos Agentes do sistema (edição de parâmetros globais, ativação/desativação, criação de categorias).
3. **Hub de Conectores MCP de IA (Geração):**
   - Configuração de chaves e servidores MCP para uso do plano/conta pessoal do usuário nos agentes:
     - **Google MCP / Gemini API** (suporte nativo ao **Nano Banana 2**, Imagen e Gemini).
     - **OpenAI / ChatGPT MCP** (uso de modelos GPT/DALL-E da conta do usuário).
     - **Runway MCP** (geração de imagens e vídeos).
     - **Servidor MCP Customizado** (conexão via URL SSE / HTTP com headers de autenticação).
4. **Configuração de Armazenamento de Mídias (Google Drive MCP vs. Cloudflare R2 vs. AWS S3):**
   - **Seletor de Armazenamento Padrão Ativo (Radio Card):**
     - **Opção 1: Google Drive MCP (Padrão Automático do Login)** — Mostra o status *"Conectado via Google Login (email@gmail.com)"*, a pasta raiz `/PromptFolio` e permite também configurar um endpoint MCP do Google Drive customizado caso o usuário deseje usar outra conta.
     - **Opção 2: Cloudflare R2** — Campos para `Account ID / Endpoint S3`, `Access Key ID`, `Secret Access Key`, `Bucket Name` e `Public URL`.
     - **Opção 3: AWS S3** — Campos para `Region`, `Access Key ID`, `Secret Access Key`, `Bucket Name` e `Custom Endpoint` (opcional).
   - Botão **"Testar Conexão e Salvamento"** em todas as 3 opções.

### 3.6. Módulo 5: Páginas de Tutoriais Internos (Onboarding Cloud)
Seção educativa bilíngue (PT/EN) dentro do app ensinando qualquer usuário a configurar seus serviços passo a passo:
1. **Guia Google Drive MCP:** Explica como funciona o vínculo automático pelo login, como a estrutura de pastas `/PromptFolio` é organizada automaticamente no Drive e como reconectar permissões ou usar um servidor MCP próprio.
2. **Guia Passo a Passo Cloudflare R2:**
   - Como criar a conta Cloudflare, ativar o R2 e criar um Bucket;
   - Bloco copiável com a configuração exata de **CORS JSON**;
   - Como gerar o Token de API R2 com permissão de leitura e escrita (*Object Read & Write*) e onde colar cada chave nas configurações do PromptFolio.
3. **Guia Passo a Passo AWS S3:**
   - Como criar um Bucket S3 na AWS, definir a região e configurar o **CORS JSON** (com botão de copiar);
   - Como gerar chaves IAM (`Access Key` e `Secret Key`) com política de segurança restrita apenas ao bucket do aplicativo.

---

## 4. Esquema do Banco de Dados (PostgreSQL)

1. **`users`**
   - `id` (UUID, PK), `google_id` (String, Unique), `email`, `name`, `avatar_url`, `encrypted_google_access_token` (Text), `encrypted_google_refresh_token` (Text), `language` (`pt-BR` | `en-US`), `theme` (`light` | `dark`), `active_storage_provider` (`google_drive_mcp` | `cloudflare_r2` | `aws_s3`, default: `'google_drive_mcp'`), `created_at`.
2. **`storage_configs`**
   - `id` (UUID, PK), `user_id` (FK), `provider` (`google_drive_mcp` | `cloudflare_r2` | `aws_s3`), `drive_root_folder_id` (String, nullable), `endpoint_url` (String, nullable), `bucket_name` (String, nullable), `region` (String, nullable), `public_url_prefix` (String, nullable), `encrypted_access_key` (Text, nullable), `encrypted_secret_key` (Text, nullable), `is_configured` (Boolean), `updated_at`.
3. **`mcp_connections` (Provedores de Geração)**
   - `id` (UUID, PK), `user_id` (FK), `provider_type` (`google_nano_banana` | `openai_chatgpt` | `runway` | `custom_mcp`), `name`, `connection_type` (`api_key` | `mcp_sse`), `endpoint_url` (String, nullable), `encrypted_credentials` (Text - AES-256), `default_model` (String), `is_active` (Boolean), `created_at`.
4. **`categories` & `tags`**
   - `id` (UUID, PK), `user_id` (FK), `name`, `slug`, `color`, `modality_scope` (`all` | `image` | `video` | `audio` | `text`).
5. **`agents`**
   - `id` (UUID, PK), `user_id` (FK), `category_id` (FK), `name`, `description`, `agent_role` (`meta_agent_builder` | `prompt_builder` | `delivery_executor`), `system_prompt` (Text), `preferred_mcp_id` (FK opcional), `is_system_default` (Boolean), `is_published` (Boolean), `created_at`.
6. **`prompts`**
   - `id` (UUID, PK), `user_id` (FK), `category_id` (FK), `title`, `description`, `prompt_template` (Text), `variables_schema` (JSONB), `tags` (ARRAY/JSONB), `target_modality` (`image` | `video` | `audio` | `text`), `preferred_mcp_id` (FK opcional), `is_published` (Boolean), `created_at`.
7. **`chat_sessions`**
   - `id` (UUID, PK), `user_id` (FK), `workspace_type` (`builder_agent` | `builder_prompt` | `executor`), `locked_agent_id` (FK - **Imutável após início da sessão**), `prompt_id` (FK opcional para executor), `delivery_modality` (`image` | `video` | `audio` | `text` | `null`), `title`, `created_at`.
8. **`chat_messages`**
   - `id` (UUID, PK), `session_id` (FK), `role` (`user` | `assistant`), `content` (Text), `attachment_asset_id` (FK opcional), `created_at`.
9. **`generated_assets`**
   - `id` (UUID, PK), `user_id` (FK), `session_id` (FK), `prompt_id` (FK), `modality` (`image` | `video` | `audio` | `text`), `storage_provider_used` (`google_drive_mcp` | `cloudflare_r2` | `aws_s3`), `remote_file_id_or_key` (String), `remote_view_url` (String), `mime_type` (String), `file_size_bytes` (BigInt), `created_at`.

---

## 5. Arquitetura do Serviço de Armazenamento Unificado (`StorageRouterService` no FastAPI)

O backend em Python deve implementar o padrão *Strategy* para decidir automaticamente onde salvar cada entrega do Chat Executor com base no campo `user.active_storage_provider`:

1. **`GoogleDriveMCPAdapter` (Padrão Inicial Automático):**
   - Utiliza o token OAuth da sessão Google do usuário (ou conector MCP do Drive) para verificar/criar a pasta `/PromptFolio/<Modalidade>/<Categoria>/` e fazer upload do arquivo binário gerado, retornando o `webViewLink` e `webContentLink`.
2. **`CloudflareR2Adapter`:**
   - Utiliza `boto3.client('s3', endpoint_url=..., aws_access_key_id=..., aws_secret_access_key=..., region_name='auto')` para subir o arquivo na chave `PromptFolio/<Modalidade>/<Categoria>/<timestamp>_<filename>`.
3. **`AWSS3Adapter`:**
   - Utiliza `boto3.client('s3', region_name=..., aws_access_key_id=..., aws_secret_access_key=...)` seguindo a mesma organização de pastas e retornando a URL assinada ou pública.

---

## 6. Roteiro de Construção Passo a Passo para o Replit Agent
1. **Etapa 1 (Fundação, UI Bilíngue e Auth com Google Drive Padrão):** Configurar PostgreSQL, FastAPI e React (Vite + Tailwind + shadcn). Implementar Topbar/Sidebar com troca de idioma (PT-BR/EN-US), tema (Light/Dark) e Login Google que já ativa o **Google Drive MCP** como armazenamento padrão inicial na conta do usuário.
2. **Etapa 2 (Estúdio Construtor com Trava de Agente + Catálogo):** Criar os menus de *Construtor de Agentes* e *Construtor de Prompts* com sementes (seeds) de agentes especialistas de fábrica, trava obrigatória de agente por conversa (`locked_agent_id`) e o botão **"Salvar e Publicar"** com Card de Revisão Final.
3. **Etapa 3 (Estúdio Executor Multimodal + Salvamento Automático):** Construir o Chat Executor separado em 4 abas (*Entregar Imagens*, *Entregar Vídeos*, *Entregar Áudios*, *Entregar Textos*), com preenchimento de variáveis, botão de download local e roteamento automático de upload para o provedor ativo (Google Drive MCP por padrão, ou R2/S3).
4. **Etapa 4 (Configurações de MCPs, R2/S3 e Páginas de Tutoriais):** Implementar a tela de Configurações para cadastro criptografado de MCPs (Google Nano Banana 2, OpenAI/ChatGPT, Runway) e troca de armazenamento para Cloudflare R2 ou AWS S3, além das 3 páginas completas de tutoriais interativos (Drive, R2 e S3) com JSONs de CORS copiáveis.