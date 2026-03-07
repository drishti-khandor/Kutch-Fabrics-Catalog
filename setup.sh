#!/bin/bash
set -e

echo "🚀 Smart Shop Catalog — Setup"
echo "================================"

# Check .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env — please add your GEMINI_API_KEY, then re-run this script."
  exit 1
fi

# Create catalog_data folder structure
echo "📁 Creating folder structure..."
mkdir -p catalog_data/originals
mkdir -p catalog_data/watermarked
mkdir -p catalog_data/Fabrics/{Ajarak,Bandhani,Chanderi,Cotton,Georgette,Kota,Linen,Modal,Net,Rayon,Silk,Velvet}
mkdir -p catalog_data/Garments/Kurtis/{Short_Kurti,Long_Kurti,Anarkali}
mkdir -p catalog_data/Garments/{Tops,Bottoms,Dresses,Jumpsuits,Saree_Blouses}
mkdir -p catalog_data/Sarees/{Banarasi,Chiffon,Cotton,Crepe,Designer,Georgette,Printed,Silk,Wedding}

echo "✅ Folder structure ready."
echo ""
echo "🐳 Starting Docker containers..."
docker compose up --build -d

echo ""
echo "✅ All done! Open http://localhost:3000 in your browser."
