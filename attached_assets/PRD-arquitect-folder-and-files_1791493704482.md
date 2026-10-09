promptfolio/

├── .env.example

├── pyproject.toml

├── alembic.ini

├── backend/

│   ├── main.py

│   ├── config.py

│   ├── database.py

│   ├── crypto.py

│   ├── models/

│   │   ├── \_\_init\_\_.py

│   │   ├── user.py

│   │   ├── prompt.py

│   │   ├── agent.py

│   │   ├── chat.py

│   │   └── storage.py

│   ├── schemas/

│   │   ├── auth.py

│   │   ├── prompt.py

│   │   ├── chat.py

│   │   └── storage.py

│   ├── routers/

│   │   ├── auth.py

│   │   ├── builder.py

│   │   ├── delivery.py

│   │   ├── catalog.py

│   │   └── settings.py

│   └── services/

│       ├── mcp\_client.py

│       ├── storage\_manager.py

│       └── google\_drive.py

├── frontend/

│   ├── index.html

│   ├── package.json

│   ├── vite.config.ts

│   ├── tailwind.config.js

│   ├── postcss.config.js

│   ├── components.json

│   ├── src/

│   │   ├── main.tsx

│   │   ├── App.tsx

│   │   ├── index.css

│   │   ├── i18n.ts

│   │   ├── components/

│   │   │   ├── ui/          # Componentes shadcn/ui

│   │   │   ├── layout/      # Sidebar, Header, ThemeToggle

│   │   │   ├── builder/     # Chat, AgentSelector, SaveModal

│   │   │   ├── delivery/    # ImageTab, VideoTab, AudioTab, TextTab

│   │   │   ├── catalog/     # PromptGrid, Filters, SearchBar

│   │   │   └── settings/    # StorageConfig, ApiKeysConfig

│   │   ├── store/

│   │   │   ├── useAuthStore.ts

│   │   │   ├── useChatStore.ts

│   │   │   └── useSettingsStore.ts

│   │   ├── hooks/

│   │   │   └── useLocalStorage.ts

│   │   └── locales/

│   │       ├── pt-BR.json

│   │       └── en-US.json

└── alembic/

&#x20;   ├── env.py

&#x20;   └── versions/



