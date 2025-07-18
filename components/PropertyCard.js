export default function PropertyCard({ property }) {
  // Helper to build title
  function getPropertyTitle(prop) {
    const type = prop.type || 'Property';
    const city = prop.city || prop.fileCityName || '';
    const province = prop.province || prop.fileProvinceName || '';
    let location = city;
    if (province && province.toLowerCase() !== city.toLowerCase()) {
      location = location ? `${location}, ${province}` : province;
    }
    return `${type.charAt(0).toUpperCase() + type.slice(1)} in ${location}`.trim();
  }

  const {
    price,
    city,
    province,
    country,
    imageUrls,
    type
  } = property;

  const location = [city, province, country].filter(Boolean).join(', ');
  const image = imageUrls?.[0];
  const title = getPropertyTitle(property);

  return (
    <div className="border rounded-xl p-4 bg-white shadow-md mb-4 max-w-md">
      {image && (
        <img
          src={image}
          alt={title}
          className="w-full h-48 object-cover rounded-lg mb-3"
        />
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-600">{location || 'Unknown Location'}</p>
      <p className="text-blue-700 font-bold mt-1">{price ? `€${price.toLocaleString()}` : 'Price not available'}</p>
      <button className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        View Property
      </button>
    </div>
  );
}

