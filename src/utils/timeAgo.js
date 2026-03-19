export const timeAgo = (dateString) => {
  if (!dateString) return "Nunca";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Desconocido";
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return "Hace menos de un minuto";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `Hace ${diffInMinutes} minuto${diffInMinutes !== 1 ? "s" : ""}`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `Hace ${diffInHours} hora${diffInHours !== 1 ? "s" : ""}`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `Hace ${diffInDays} día${diffInDays !== 1 ? "s" : ""}`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `Hace ${diffInMonths} ${diffInMonths !== 1 ? "meses" : "mes"}`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `Hace ${diffInYears} año${diffInYears !== 1 ? "s" : ""}`;
};

export const hoursAgo = (dateString) => {
  if (!dateString) return Infinity;
  const date = new Date(dateString);
  const now = new Date();
  const diffInMilliseconds = now - date;
  return diffInMilliseconds / (1000 * 60 * 60);
};
