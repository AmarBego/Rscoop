# Rscoop - Modern Scoop GUI

A modern, responsive GUI for the Scoop package manager on Windows, built with SolidJS and Tauri.

## Features

- 🔍 Search packages across all buckets
- 📦 Manage installed packages
- 🚀 Install, update, and remove packages
- 🎨 Modern, responsive UI with dark mode
- ⌨️ Command palette (Ctrl+K) for quick actions

## Tech Stack

- **SolidJS** - Fast, reactive UI framework
- **Tauri** - Lightweight, secure desktop app framework
- **Tailwind CSS** - Utility-first CSS framework
- **Kobalte** - Headless UI components
- **Lucide Icons** - Beautiful, consistent icons
- **Motion One** - Performant animations

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Scoop](https://scoop.sh/) installed on your system

## Development

1. Clone the repository:

```bash
git clone https://github.com/yourusername/rscoop.git
cd rscoop
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run tauri dev
```

## Building

To build the application for production:

```bash
npm run tauri build
```

This will create an installer in the `src-tauri/target/release/bundle` directory.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
