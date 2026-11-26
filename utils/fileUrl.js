export const generateFileUrl = (req, filename, folder) => {
  return `${req.protocol}://${req.get("host")}/uploads/${folder}/${filename}`;
};


