# Netflix Catalogue Visualization

Web application for visualizing and exploring the Netflix catalogue using **D3.js**.

## Technologies

* JavaScript
* HTML / CSS
* D3.js
* Vite
* npm

## Requirements

Make sure you have **Node.js** and **npm** installed.

Check your installation with:

```bash
node --version
npm --version
```

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd netflix_catalogue
```

Install the project dependencies:

```bash
npm install
```

D3.js is already listed as a project dependency, so you don't need to install it separately.

## Start the development server

Run:

```bash
npm run dev
```

Vite will start a local development server. Open the URL shown in the terminal, usually:

```text
http://localhost:5173
```

The page will automatically reload when you modify the source code.

## Project structure

```text
netflix_catalogue/
├── public/
|   └── data/               # Static data files 
|       ├── raw/            # raw csv data from kaggle
|       └── preprocessed/   # preprocessed json data (local folder, added in .gitignore)
├── src/                # Application source code
│   ├── components/     # Reusable UI components
│   ├── data/           # Data loading and processing
│   ├── visualizations/ # D3.js visualizations
│   └── main.js         # Application entry point
├── index.html
├── package.json        # Contains all the dependencies installed with npm
└── README.md
```

## Production build (not really useful for now)

To create a production build:

```bash
npm run build
```

The generated application will be placed in:

```text
dist/
```

You can preview the production build locally with:

```bash
npm run preview
```

## Development workflow

After cloning the project, the usual workflow is:

```bash
npm install
npm run dev
```

When you're finished working (see [GIT.md](GIT.md) if you want more details):

```bash
git add .
git commit -m "Describe your changes"
git push
```
